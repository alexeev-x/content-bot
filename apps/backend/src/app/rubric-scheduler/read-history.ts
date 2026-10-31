import type { DashboardDto, RubricHistoryDto, RubricKey, RubricRehearsalDto, RubricSlotDto } from '@alexeev/contracts';
import { RUBRIC_META } from '../../modules/rubrics';
import type { Container } from '../container';
import { slotDto } from './read-models';
import { rehearsalPace, schedulerMode } from './runtime';

// Whether each rubric post went out and why not (owner, 31.10.2026): a rubric's own history, the day's rubric slots
// for «Лента дня», and the DEV week-long test's journal. All read the scheduler's slots; nothing is copied.

const iso = (ms: number) => new Date(ms).toISOString();
const HISTORY_MAX = 30;
const DAY_SLOTS_MAX = 12;
const JOURNAL_DAYS = 14;
const DAY_MS = 86_400_000;

export async function readRubricHistory(
  container: Pick<Container, 'rubricSlots'>,
  key: RubricKey
): Promise<RubricHistoryDto> {
  const slots = await container.rubricSlots.ofRubric(key, HISTORY_MAX * 2);
  return {
    slots: slots
      .filter((slot) => slot.kind !== 'poll_close' && slot.status !== 'superseded')
      .slice(0, HISTORY_MAX)
      .map(slotDto)
  };
}

/** The day's rubric slots for «Лента дня»: which publication is a rubric post, and the slots with no publication. */
export async function readRubricDay(
  container: Pick<Container, 'rubricSlots'>,
  from: number,
  to: number
): Promise<{ byPublication: Map<string, RubricKey>; slots: NonNullable<DashboardDto['rubricSlots']> }> {
  const slots = (await container.rubricSlots.between(from, to)).filter(
    (slot) => slot.kind !== 'poll_close' && slot.status !== 'superseded' && RUBRIC_META[slot.rubricKey as RubricKey]
  );
  const byPublication = new Map<string, RubricKey>();
  for (const slot of slots)
    if (slot.publicationId !== null) byPublication.set(slot.publicationId, slot.rubricKey as RubricKey);
  return {
    byPublication,
    slots: slots
      .filter((slot) => slot.publicationId === null)
      .sort((a, b) => a.slotAt - b.slotAt)
      .slice(0, DAY_SLOTS_MAX)
      .map((slot) => ({
        slotId: slot.id,
        rubricKey: slot.rubricKey as RubricKey,
        at: iso(slot.slotAt),
        state: slot.status as RubricSlotDto['state'],
        code: slot.errorCode
      }))
  };
}

export async function readRehearsal(
  container: Pick<Container, 'rubricRehearsal' | 'schedulerEnv' | 'clock'>
): Promise<RubricRehearsalDto> {
  const env = container.schedulerEnv;
  const empty = { ok: 0, bad: 0, void: 0, pending: 0 };
  if (rehearsalPace(env, schedulerMode(env)) === null)
    return { active: false, startedAt: null, counts: empty, items: [] };
  const now = container.clock.now();
  const [startedAt, rows] = await Promise.all([
    container.rubricRehearsal.startedAt(),
    container.rubricRehearsal.list(now - JOURNAL_DAYS * DAY_MS, now + 3 * DAY_MS)
  ]);
  const counts = { ...empty };
  for (const row of rows) counts[row.verdict] += 1;
  return {
    active: true,
    startedAt: startedAt === null ? null : iso(startedAt),
    counts,
    items: rows
      .filter((row) => RUBRIC_META[row.rubricKey as RubricKey] !== undefined)
      .map((row) => ({
        slotId: row.slotId,
        rubricKey: row.rubricKey as RubricKey,
        kind: row.kind.slice(0, 20),
        at: iso(row.slotAt),
        scenario: row.scenario,
        fired: row.fired,
        verdict: row.verdict,
        state: row.status as RubricSlotDto['state'] | null,
        code: row.errorCode,
        note: row.note,
        checkedAt: row.checkedAt === null ? null : iso(row.checkedAt)
      }))
  };
}
