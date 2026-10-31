import { mskParts } from '../../../shared/msk-time';
import { DAY_MS } from '../constants';
import { type HourGroup, hourAdvice } from '../domain/hour-advice';
import { restAdvice } from '../domain/rest-advice';
import type { HourPlan, LearningRepository, RestSettings, ScoreRepository } from './ports';

// The Monday `learn` step (area-backend-analytics.md §10.2): rest and hour advice from the scores. Four weeks from the
// first scored post it only advises; then it applies through the scheduler's own conditional writes, unless the owner
// switched that off (owner, 31.10.2026: answer 10). Each change is claimed by its Monday, kind and subject first, so a
// replay neither logs nor applies twice.

export const ADVISE_MS = 28 * DAY_MS;

export type LearningMode = 'advise' | 'apply' | 'off';

export function learningMode(state: { startedAt: number | null; applyEnabled: boolean }, now: number): LearningMode {
  if (state.startedAt === null || now < state.startedAt + ADVISE_MS) return 'advise';
  return state.applyEnabled ? 'apply' : 'off';
}

export async function learnRubrics(deps: {
  scores: ScoreRepository;
  learning: LearningRepository;
  rests: RestSettings;
  hours: HourPlan;
  /** Pool rubrics only: event, chain and anchor rubrics keep their own rhythm. */
  pool: ReadonlySet<string>;
  newId: () => string;
  now: number;
}): Promise<{ mode: LearningMode; rest: number; hour: number; applied: number } | 'not_monday' | 'no_data'> {
  const { now } = deps;
  const parts = mskParts(now);
  if (parts.weekday !== 1) return 'not_monday';
  const weekKey = parts.day;
  let state = await deps.learning.state();
  if (state.startedAt === null) {
    const first = await deps.learning.firstScoredAt();
    if (first === null) return 'no_data';
    await deps.learning.start(first, now);
    state = { ...state, startedAt: first };
  }
  const mode = learningMode(state, now);

  const [rows, rests, slots, history] = await Promise.all([
    deps.scores.bySent({ from: now - 365 * DAY_MS, to: now }, 1000),
    deps.rests.read(),
    deps.hours.readSlots(),
    deps.learning.history('rest', 200)
  ]);
  const main = rows.filter((row) => row.role === 'main');
  const lastApplied = new Map<string, number>();
  for (const row of history)
    if (row.applied && !lastApplied.has(row.subject)) lastApplied.set(row.subject, row.createdAt);

  const restProposals = restAdvice(
    rests
      .filter((rest) => deps.pool.has(rest.rubric))
      .map((rest) => ({
        rubric: rest.rubric,
        restDays: rest.restDays,
        source: rest.source,
        lastChangeAt: lastApplied.get(rest.rubric) ?? null,
        composites: main.filter((row) => row.rubric === rest.rubric).map((row) => row.composite)
      })),
    now
  );
  const hourProposals = hourAdvice(
    main
      .filter((row) => row.sentAt >= now - 90 * DAY_MS)
      .map((row) => ({
        rubric: row.rubric,
        composite: row.composite,
        weekday: row.slices.weekday,
        hour: row.slices.hour
      })),
    slots.map((slot) => ({
      group: slot.group as HourGroup,
      part: slot.part,
      minute: slot.minute,
      source: slot.source,
      changedAt: slot.changedAt
    })),
    now
  );

  let applied = 0;
  const act = async (
    kind: 'rest' | 'hour',
    subject: string,
    from: number,
    to: number,
    reason: string,
    numbers: object,
    apply: () => Promise<'applied' | 'conflict' | 'manual' | 'out_of_range'>
  ) => {
    const claimed = await deps.learning.claim({
      id: deps.newId(),
      weekKey,
      kind,
      subject,
      from,
      to,
      applied: false,
      outcome: 'advised',
      reason,
      numbers,
      createdAt: now
    });
    if (!claimed || mode !== 'apply') return;
    const outcome = await apply();
    if (outcome === 'applied') applied += 1;
    await deps.learning.settle(weekKey, kind, subject, outcome);
  };
  for (const proposal of restProposals)
    await act(
      'rest',
      proposal.rubric,
      proposal.from,
      proposal.to,
      proposal.reason,
      { xs: round(proposal.xs), n: proposal.n },
      () => deps.rests.apply(proposal.rubric, proposal.from, proposal.to, now)
    );
  for (const proposal of hourProposals)
    await act(
      'hour',
      `${proposal.group}:${proposal.part}`,
      proposal.from,
      proposal.to,
      'gain',
      { gain: round(proposal.gain), n: proposal.n },
      () => deps.hours.apply(proposal.group, proposal.part, proposal.from, proposal.to, now)
    );
  return { mode, rest: restProposals.length, hour: hourProposals.length, applied };
}

const round = (value: number) => Math.round(value * 1000) / 1000;
