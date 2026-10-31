import { mskParts } from '../../../shared/msk-time';
import { plan, seedLastSent } from '../domain/plan';
import { BUILD_LEAD_MS, scheduleOf } from '../domain/slot-machine';
import type { ChannelPost, Need, RubricDescriptor } from '../domain/types';
import type { NewSlot, RubricSettingRow, SchedulerSettingsRepository, SlotRepository, SlotRow } from './ports';

// The plan step (every 30 minutes, or at once when something changed): today and tomorrow in Moscow time are planned
// again over every post of the channel. A slot already being built, or within 10 minutes of its build, is frozen and
// counts as a post; a planned one the new plan no longer holds is superseded, never moved (a new row takes its place).

const PLAN_DAYS = 2;
const FREEZE_BEFORE_BUILD_MS = 10 * 60_000;
const DAY_MS = 86_400_000;

export interface PlanSlotsDeps {
  slots: SlotRepository;
  settings: SchedulerSettingsRepository;
  newId: () => string;
  now: number;
}

export interface PlanSlotsInput {
  /** Every rubric; only those the scheduler may run here are planned. */
  rubrics: RubricDescriptor[];
  /** Rubrics whose inner rules are coded: the only ones that may go out (§11 «Stage 4»). */
  ready: ReadonlySet<string>;
  capabilities: ReadonlySet<Need>;
  /** The channel's other posts (the news, the owner's): never our own rubric posts. */
  channel: ChannelPost[];
  latestPatchAt: number | null;
  horoscopeAnchorWeek: string | null;
}

/** Whether a slot is past re-planning: being built or about to be. */
const frozen = (slot: SlotRow, now: number) =>
  slot.status !== 'planned' || slot.buildAt - now <= FREEZE_BEFORE_BUILD_MS;

const asPost = (slot: SlotRow): ChannelPost => ({
  at: slot.slotAt,
  weight: slot.weight,
  rubric: slot.rubricKey,
  interactive: slot.interactive,
  family: slot.family
});

/** The start-up seed for the rubrics that have no row yet (§13): spread over the first weeks, marked as seeded. */
export async function seedRubricSettings(
  deps: Pick<PlanSlotsDeps, 'settings' | 'now'>,
  rubrics: RubricDescriptor[],
  existing: RubricSettingRow[]
): Promise<void> {
  const known = new Set(existing.map((row) => row.rubricKey));
  const missing = rubrics.filter((rubric) => !known.has(rubric.key) && rubric.restDays !== null);
  if (missing.length === 0) return;
  const seeded = seedLastSent(missing, deps.now);
  await deps.settings.seedRubrics(
    missing.map((rubric) => ({
      rubricKey: rubric.key,
      restDays: Math.min(Math.max(rubric.restDays ?? 7, 7), 60),
      lastSentAt: seeded[rubric.key] ?? null,
      seeded: seeded[rubric.key] !== undefined
    })),
    deps.now
  );
}

export async function planSlots(
  deps: PlanSlotsDeps,
  input: PlanSlotsInput
): Promise<{ inserted: number; superseded: number }> {
  const now = deps.now;
  let settings = await deps.settings.rubrics();
  await seedRubricSettings(deps, input.rubrics, settings);
  settings = await deps.settings.rubrics();
  const byKey = new Map(settings.map((row) => [row.rubricKey, row]));

  const today = mskParts(now).day;
  const recent = await deps.slots.between(now - 7 * DAY_MS, now + (PLAN_DAYS + 1) * DAY_MS);
  const counted = recent.filter((slot) =>
    ['building', 'ready', 'released', 'waiting_parent', 'unknown', 'sent', 'partial', 'unresolved'].includes(
      slot.status
    )
  );
  const live = recent.filter((slot) => slot.status === 'planned' && slot.mskDay >= today);
  const kept = live.filter((slot) => frozen(slot, now));
  const replanned = live.filter((slot) => !frozen(slot, now));

  // The rubric's last post is its real one or a frozen slot still ahead: the plan never rests it twice.
  const lastSent: Record<string, number> = {};
  for (const row of settings) if (row.lastSentAt !== null) lastSent[row.rubricKey] = row.lastSentAt;
  for (const slot of [...counted, ...kept])
    lastSent[slot.rubricKey] = Math.max(lastSent[slot.rubricKey] ?? 0, slot.slotAt);

  const runnable = input.rubrics.filter((rubric) => {
    const row = byKey.get(rubric.key);
    return (
      input.ready.has(rubric.key) &&
      row !== undefined &&
      row.enabled &&
      row.pausedReason === null &&
      (row.skipUntil === null || row.skipUntil <= now)
    );
  });
  const restOf = new Map(settings.map((row) => [row.rubricKey, row.restDays]));
  const result = plan({
    now,
    days: PLAN_DAYS,
    // The owner's rest wins over the default one.
    rubrics: runnable.map((rubric) => ({ ...rubric, restDays: restOf.get(rubric.key) ?? rubric.restDays })),
    lastSent,
    channel: [...input.channel, ...counted.map(asPost), ...kept.map(asPost)],
    capabilities: input.capabilities,
    lastHeroPatchAt: input.latestPatchAt,
    horoscopeAnchorWeek: input.horoscopeAnchorWeek
  });

  const descriptors = new Map(input.rubrics.map((rubric) => [rubric.key, rubric]));
  const stays = (slot: SlotRow) =>
    result.slots.some((each) => each.rubric === slot.rubricKey && each.at === slot.slotAt);
  let superseded = 0;
  for (const slot of replanned) {
    if (stays(slot)) continue;
    if (
      await deps.slots.transition({
        id: slot.id,
        from: 'planned',
        to: 'superseded',
        now,
        set: { errorCode: 'REPLANNED' }
      })
    )
      superseded += 1;
  }
  const fresh: NewSlot[] = result.slots
    .filter((slot) => !replanned.some((each) => each.rubricKey === slot.rubric && each.slotAt === slot.at))
    .flatMap((slot) => {
      const rubric = descriptors.get(slot.rubric);
      if (rubric === undefined) return [];
      const day = mskParts(slot.at).day;
      const buildAt = slot.at - BUILD_LEAD_MS;
      const times = scheduleOf('planned', { slotAt: slot.at, buildAt }, now);
      return [
        {
          id: deps.newId(),
          mskDay: day,
          slotAt: slot.at,
          kind: rubric.trigger === 'anchor' ? ('anchor' as const) : ('pool' as const),
          rubricKey: slot.rubric,
          candidates: [slot.rubric, ...slot.alternates].slice(0, 3),
          candIdx: 0,
          attempt: 0,
          status: 'planned' as const,
          buildAt,
          nextActionAt: times.nextActionAt,
          deadlineAt: times.deadlineAt,
          weight: rubric.weight === 'L' ? ('L' as const) : ('V' as const),
          interactive: rubric.interactive,
          family: rubric.family,
          dedupeKey: `${rubric.trigger === 'anchor' ? 'anchor' : 'pool'}:${slot.rubric}:${day}`,
          reason: slot.reason,
          createdAt: now
        }
      ];
    });
  const inserted = await deps.slots.insert(fresh, now);
  return { inserted, superseded };
}
