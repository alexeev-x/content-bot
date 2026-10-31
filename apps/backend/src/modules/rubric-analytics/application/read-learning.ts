import { DAY_MS } from '../constants';
import { DEFAULT_MINUTES, type HourGroup, hourAdvice, hourGroups } from '../domain/hour-advice';
import { REST_MAX, REST_MIN, restAdvice } from '../domain/rest-advice';
import { ADVISE_MS, learningMode } from './learn';
import type { HourPlan, LearningRepository, RestSettings, ScoreRepository } from './ports';

// «Рубрики» → «Аналитика» → «Обучение»: the mode, each pool rubric's rest with today's advice and its history, and the
// slot hours by day group. The advice is computed now from the same pure rules the Monday step uses.

const iso = (ms: number) => new Date(ms).toISOString();

export async function readRubricLearning(deps: {
  scores: ScoreRepository;
  learning: LearningRepository;
  rests: RestSettings;
  hours: HourPlan;
  pool: ReadonlySet<string>;
  now: number;
}) {
  const { now } = deps;
  const [state, rows, rests, slots, history] = await Promise.all([
    deps.learning.state(),
    deps.scores.bySent({ from: now - 365 * DAY_MS, to: now }, 1000),
    deps.rests.read(),
    deps.hours.readSlots(),
    deps.learning.history('rest', 200)
  ]);
  const main = rows.filter((row) => row.role === 'main');
  const pool = rests.filter((rest) => deps.pool.has(rest.rubric));
  const lastApplied = new Map<string, number>();
  for (const row of history)
    if (row.applied && !lastApplied.has(row.subject)) lastApplied.set(row.subject, row.createdAt);
  const composites = (rubric: string) => main.filter((row) => row.rubric === rubric).map((row) => row.composite);
  // Today's advice without the weekly cap of three: the page shows every rubric's own verdict.
  const advice = new Map(
    pool.flatMap((rest) =>
      restAdvice(
        [{ ...rest, lastChangeAt: lastApplied.get(rest.rubric) ?? null, composites: composites(rest.rubric) }],
        now
      ).map((proposal) => [proposal.rubric, proposal] as const)
    )
  );
  const recent = main.filter((row) => row.sentAt >= now - 90 * DAY_MS);
  const hourPosts = recent.map((row) => ({
    rubric: row.rubric,
    composite: row.composite,
    weekday: row.slices.weekday,
    hour: row.slices.hour
  }));
  const typedSlots = slots.map((slot) => ({ ...slot, group: slot.group as HourGroup }));
  const hourProposals = hourAdvice(hourPosts, typedSlots, now);
  const groups = hourGroups(hourPosts);
  return {
    mode: learningMode(state, now),
    startedAt: state.startedAt === null ? null : iso(state.startedAt),
    applyFrom: state.startedAt === null ? null : iso(state.startedAt + ADVISE_MS),
    applyEnabled: state.applyEnabled,
    rest: pool.map((rest) => {
      const proposal = advice.get(rest.rubric);
      return {
        rubric: rest.rubric,
        restDays: Math.min(Math.max(rest.restDays, REST_MIN), REST_MAX),
        source: rest.source,
        advice: proposal === undefined ? null : { toDays: proposal.to, reason: proposal.reason },
        few: composites(rest.rubric).length < 4,
        history: history
          .filter((row) => row.subject === rest.rubric)
          .slice(0, 5)
          .map((row) => ({ at: iso(row.createdAt), from: row.from, to: row.to, outcome: row.outcome }))
      };
    }),
    hours: groups.map((group) => ({
      group,
      n: hourPosts.filter((post) =>
        group === 'wd'
          ? post.weekday <= 4
          : group === 'we'
            ? post.weekday >= 5
            : post.weekday === ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].indexOf(group)
      ).length,
      slots: (['day', 'evening'] as const).map((part) => {
        const slot = typedSlots.find((each) => each.group === group && each.part === part);
        const proposal = hourProposals.find((each) => each.group === group && each.part === part);
        return {
          part,
          minute: slot?.minute ?? DEFAULT_MINUTES[part],
          defaultMinute: DEFAULT_MINUTES[part],
          source: slot?.source ?? ('default' as const),
          advice: proposal === undefined ? null : { toMinute: proposal.to }
        };
      })
    }))
  };
}
