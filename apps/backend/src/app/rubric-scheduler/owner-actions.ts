import type { RubricKey } from '@alexeev/contracts';
import { deletePost } from '../../modules/lifecycle';
import { RUBRIC_META } from '../../modules/rubrics';
import { AppError } from '../../shared/app-error';
import { addMskDays, fromMsk, mskParts, mskWeekday } from '../../shared/msk-time';
import type { Container } from '../container';
import { RUBRIC_ACTOR } from '../workflows/rubric-actor';
import { schedulerMode } from './runtime';

// The owner's actions in «Рубрики»: the switch and its channel, a rubric on/off and its rest, «Пропустить слот». Each
// is conditional on the revision the owner saw; a change the plan must see makes the plan step due at once.

const DAY_MS = 86_400_000;

type SlotRowLike = { rubricKey: string; slotAt: number };

type ActionContainer = Pick<
  Container,
  'rubricSchedulerSettings' | 'rubricSlots' | 'destinations' | 'schedulerEnv' | 'clock' | 'posts' | 'lifecycle'
>;

const stale = () => new AppError('CONFLICT', 'Someone changed it meanwhile', { reason: 'STALE_REVISION' });

function nextMonday(day: string): string {
  const weekday = mskWeekday(fromMsk(day, 12 * 60));
  return addMskDays(day, ((8 - weekday) % 7) + (weekday === 1 ? 7 : 0));
}

export async function updateScheduler(
  container: ActionContainer,
  input: { enabled: boolean; destinationId?: string | null | undefined; revision: number }
): Promise<void> {
  if (schedulerMode(container.schedulerEnv) === 'unavailable')
    throw new AppError('CONFLICT', 'The scheduler does not run here', { reason: 'UNAVAILABLE_HERE' });
  const now = container.clock.now();
  const current = await container.rubricSchedulerSettings.read();
  const destinationId = input.destinationId === undefined ? current.destinationId : input.destinationId;
  if (input.enabled && destinationId === null && schedulerMode(container.schedulerEnv) === 'live')
    throw new AppError('VALIDATION_ERROR', 'Choose the channel first', { reason: 'DESTINATION_REQUIRED' });
  if (destinationId !== null) {
    const destination = await container.destinations.findById(destinationId);
    if (destination === null || !destination.enabled || destination.kind !== 'channel')
      throw new AppError('VALIDATION_ERROR', 'Not an enabled channel', { reason: 'DESTINATION_NOT_ALLOWED' });
  }
  const applied = await container.rubricSchedulerSettings.update({
    enabled: input.enabled,
    destinationId,
    horoscopeAnchorWeek: nextMonday(mskParts(now).day),
    revision: input.revision,
    now
  });
  if (!applied) throw stale();
  await container.rubricSchedulerSettings.planDirty();
}

export async function updateRubric(
  container: ActionContainer,
  key: RubricKey,
  input: { enabled?: boolean | undefined; restDays?: number | undefined; revision: number }
): Promise<void> {
  const meta = RUBRIC_META[key];
  const row = (await container.rubricSchedulerSettings.rubrics()).find((each) => each.rubricKey === key);
  if (row === undefined) {
    // No row before the first plan: the rubric is known, its settings simply were not written yet.
    if (meta.restDays === null)
      throw new AppError('NOT_FOUND', 'This rubric has no rest', { reason: 'RUBRIC_NOT_FOUND' });
    await container.rubricSchedulerSettings.seedRubrics(
      [{ rubricKey: key, restDays: meta.restDays, lastSentAt: null, seeded: false }],
      container.clock.now()
    );
    return updateRubric(container, key, { ...input, revision: 0 });
  }
  const now = container.clock.now();
  // Turned on again, it is due at its next fitting slot rather than waiting a whole rest (§13).
  const turnedOn = input.enabled === true && !row.enabled;
  const applied = await container.rubricSchedulerSettings.updateRubric({
    rubricKey: key,
    revision: input.revision,
    ...(input.enabled === undefined ? {} : { enabled: input.enabled }),
    ...(input.restDays === undefined ? {} : { restDays: input.restDays }),
    ...(turnedOn ? { lastSentAt: now - (input.restDays ?? row.restDays) * DAY_MS } : {}),
    now
  });
  if (!applied) throw stale();
  // Off: its slots not yet released are cancelled.
  if (input.enabled === false)
    for (const slot of await container.rubricSlots.live())
      if (slot.rubricKey === key && ['planned', 'building', 'ready'].includes(slot.status))
        await skip(container, slot.id, 'RUBRIC_OFF');
  await container.rubricSchedulerSettings.planDirty();
}

async function skip(container: ActionContainer, id: string, code: string): Promise<SlotRowLike> {
  const slot = await container.rubricSlots.byId(id);
  if (slot === null) throw new AppError('NOT_FOUND', 'Slot not found', { reason: 'SLOT_NOT_FOUND' });
  if (slot.status === 'released' || slot.status === 'unknown' || slot.status === 'waiting_parent')
    throw new AppError('CONFLICT', 'Already handed to publishing: cancel it in «Публикации»', {
      reason: 'ALREADY_RELEASED'
    });
  if (slot.status !== 'planned' && slot.status !== 'building' && slot.status !== 'ready')
    throw new AppError('CONFLICT', 'The slot already ended', { reason: 'NOT_LIVE' });
  const now = container.clock.now();
  if (
    !(await container.rubricSlots.transition({
      id,
      from: slot.status,
      to: 'cancelled',
      now,
      set: { errorCode: code, leaseUntil: null }
    }))
  )
    throw stale();
  for (const post of slot.build?.posts ?? []) {
    const current = await container.posts.findById(post.postId);
    if (current !== null)
      await deletePost(
        { repo: container.lifecycle, now },
        { actor: RUBRIC_ACTOR, id: post.postId, revision: current.revision }
      ).catch(() => undefined);
  }
  return slot;
}

/** «Пропустить слот»: the slot is cancelled, the rubric keeps its turn (nothing went out). */
export async function skipSlot(container: ActionContainer, id: string): Promise<void> {
  const slot = await skip(container, id, 'OWNER_SKIPPED');
  // The plan must not put the same rubric straight back that day.
  await container.rubricSchedulerSettings.rubricSkipped(slot.rubricKey, slot.slotAt + DAY_MS);
  await container.rubricSchedulerSettings.planDirty();
}
