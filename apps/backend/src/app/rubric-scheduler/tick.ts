import { listRecentPublications } from '../../modules/publishing';
import { deletePost } from '../../modules/lifecycle';
import {
  BUILD_ATTEMPTS_MAX,
  BUILD_LEASE_MS,
  type ChannelPost,
  exitOf,
  type LiveStatus,
  planSlots,
  scheduleOf,
  type SlotRow
} from '../../modules/rubric-scheduler';
import { INNER_RULES_READY } from '../../modules/rubrics';
import { addMskDays, fromMsk, mskParts, mskWeekday } from '../../shared/msk-time';
import type { Container } from '../container';
import { rubricDescriptors } from '../rubric-catalog';
import { RUBRIC_ACTOR } from '../workflows/rubric-actor';
import { projectSlot } from '../workflows/rubric-project';
import { releaseSlot } from '../workflows/rubric-release';
import { schedulerState } from './locks';
import { schedulerCapabilities } from './runtime';

// One scheduler tick (every Cron minute, after the publication work; area-backend-core §8): the locks first, then the
// plan when it is due, then the due slots — at most two builds, two releases and four read-backs a tick, every move a
// conditional transition, so overlapping ticks never build or release a slot twice.

const PLAN_EVERY_MS = 30 * 60_000;
const DUE_PER_TICK = 8;
const BUILDS_PER_TICK = 2;
const RELEASES_PER_TICK = 2;
const PROJECTIONS_PER_TICK = 4;
const LOOKBACK_MS = 7 * 86_400_000;

/** The first Monday after `day` (MSK): the horoscope's rhythm starts there when the switch goes on (§13). */
function nextMonday(day: string): string {
  const weekday = mskWeekday(fromMsk(day, 12 * 60));
  return addMskDays(day, ((8 - weekday) % 7) + (weekday === 1 ? 7 : 0));
}

/** Deletes the studio posts of a slot that will never go out (an off switch, a missed release). */
async function dropPosts(container: Pick<Container, 'posts' | 'lifecycle' | 'clock'>, slot: SlotRow): Promise<void> {
  for (const post of slot.build?.posts ?? []) {
    const current = await container.posts.findById(post.postId);
    if (current === null) continue;
    await deletePost(
      { repo: container.lifecycle, now: container.clock.now() },
      { actor: RUBRIC_ACTOR, id: post.postId, revision: current.revision }
    ).catch(() => undefined);
  }
}

async function channelPosts(
  container: Pick<Container, 'publicationOutcomes'>,
  ours: Set<string>,
  now: number
): Promise<ChannelPost[]> {
  const live = ['scheduled', 'queued', 'preparing', 'sending', 'retry_wait', 'sent', 'unknown'];
  return (await listRecentPublications({ repo: container.publicationOutcomes, now }, now - LOOKBACK_MS))
    .filter((row) => live.includes(row.status) && !ours.has(row.postId))
    .map((row) => ({
      at: row.at,
      weight: row.hasMedia ? 'V' : 'L',
      rubric: null,
      interactive: row.postKind === 'poll',
      family: null
    }));
}

/** What a tick reads and writes: the scheduler's own stores and the publishing and content it hands posts to. */
export type SchedulerContainer = Pick<
  Container,
  | 'clock'
  | 'logger'
  | 'newId'
  | 'aiJobs'
  | 'rubricSlots'
  | 'rubricSchedulerSettings'
  | 'schedulerEnv'
  | 'latestPatchAt'
  | 'destinations'
  | 'publishing'
  | 'publicationOutcomes'
  | 'posts'
  | 'lifecycle'
  | 'publications'
  | 'postSource'
  | 'idempotency'
>;

export async function runRubricSchedulerTick(
  container: SchedulerContainer,
  labOn: () => Promise<boolean>
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  const state = await schedulerState(container, container.schedulerEnv, labOn);
  const now = container.clock.now();
  const slots = container.rubricSlots;

  // Switched off: the slots not yet released are cancelled once (their posts deleted); released ones finish.
  if (state.settings !== null && !state.settings.offCleanupDone && !state.settings.enabled) {
    for (const slot of await slots.live()) {
      if (slot.status !== 'planned' && slot.status !== 'building' && slot.status !== 'ready') continue;
      if (
        await slots.transition({
          id: slot.id,
          from: slot.status,
          to: 'cancelled',
          now,
          set: { errorCode: 'SWITCHED_OFF' }
        })
      ) {
        counts.cancelled = (counts.cancelled ?? 0) + 1;
        await dropPosts(container, slot);
      }
    }
    await container.rubricSchedulerSettings.markCleanupDone(now);
  }
  if (state.locks.length > 0 || state.destination === null) return { ...counts, locked: 1 };

  const settings = container.rubricSchedulerSettings;
  if (await settings.claimStep('plan', now, now + PLAN_EVERY_MS)) {
    try {
      const recent = await slots.between(now - LOOKBACK_MS, now + 3 * 86_400_000);
      const ours = new Set(recent.flatMap((slot) => (slot.build?.posts ?? []).map((post) => post.postId)));
      const anchorWeek = state.settings?.horoscopeAnchorWeek ?? nextMonday(mskParts(now).day);
      const planned = await planSlots(
        { slots, settings, newId: container.newId, now },
        {
          rubrics: rubricDescriptors(),
          ready: INNER_RULES_READY,
          capabilities: schedulerCapabilities(container.schedulerEnv, state.mode),
          channel: await channelPosts(container, ours, now),
          latestPatchAt: await container.latestPatchAt(),
          horoscopeAnchorWeek: anchorWeek
        }
      );
      counts.planned = planned.inserted;
      counts.superseded = planned.superseded;
      await settings.stepDone('plan', now, null);
    } catch (error) {
      await settings.stepDone('plan', now, error instanceof Error ? error.name.slice(0, 80) : 'PLAN_FAILED');
      throw error;
    }
  }

  let builds = 0;
  let releases = 0;
  let projections = 0;
  for (const slot of await slots.due(now, DUE_PER_TICK)) {
    const status = slot.status as LiveStatus;
    // Past its deadline with nothing done: the slot ends where its state says (§7).
    if (now > slot.deadlineAt) {
      const to = exitOf(status);
      if (
        await slots.transition({
          id: slot.id,
          from: slot.status,
          to,
          now,
          set: { errorCode: 'DEADLINE', leaseUntil: null }
        })
      ) {
        counts[to] = (counts[to] ?? 0) + 1;
        if (status === 'ready') await dropPosts(container, slot);
      }
      continue;
    }
    switch (status) {
      case 'planned': {
        if (builds >= BUILDS_PER_TICK) break;
        const attempt = slot.attempt + 1;
        const moved = await slots.transition({
          id: slot.id,
          from: 'planned',
          attempt: slot.attempt,
          to: 'building',
          now,
          set: { attempt, leaseUntil: now + BUILD_LEASE_MS, nextActionAt: now + BUILD_LEASE_MS }
        });
        if (!moved) break;
        builds += 1;
        await container.aiJobs.send({ id: container.newId(), kind: 'rubric_build', slotId: slot.id, attempt });
        break;
      }
      case 'building': {
        // The lease ran out: the build died. Try again while there is time, else the slot ends empty.
        const again = slot.attempt < BUILD_ATTEMPTS_MAX && now < slot.slotAt - 15 * 60_000;
        await slots.transition({
          id: slot.id,
          from: 'building',
          attempt: slot.attempt,
          to: again ? 'planned' : 'empty',
          now,
          set: again
            ? { leaseUntil: null, nextActionAt: now }
            : { leaseUntil: null, errorCode: 'BUILD_TIMEOUT', errorStep: 'data' }
        });
        break;
      }
      case 'ready': {
        if (releases >= RELEASES_PER_TICK) break;
        releases += 1;
        const outcome = await releaseSlot(container, slot, state.destination.id);
        counts[`release_${outcome}`] = (counts[`release_${outcome}`] ?? 0) + 1;
        break;
      }
      case 'released':
      case 'waiting_parent':
      case 'unknown': {
        if (projections >= PROJECTIONS_PER_TICK) break;
        projections += 1;
        const moved = await projectSlot(container, slot);
        if (moved === null) {
          // Nothing new: look again later, on the state's own rhythm.
          const times = scheduleOf(status, { slotAt: slot.slotAt, buildAt: slot.buildAt }, now);
          await slots.transition({
            id: slot.id,
            from: slot.status,
            to: slot.status,
            now,
            set: { nextActionAt: times.nextActionAt }
          });
        } else counts[moved] = (counts[moved] ?? 0) + 1;
        break;
      }
    }
  }
  return { ...counts, builds, releases, projections };
}
