import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers';
import { createD1HeroStats, heroSnapshots, type HeroStatsRepository, type Rate } from '../../modules/hero-stats';
import type { AppEnv } from '../env';
import { STATS_KEEP_MS } from './hero-stats';

// The nightly statistics (owner decision 29.10.2026: a Cloudflare Workflow). The Cron creates one instance a night
// with the date as its id, so a second tick cannot start the same night twice. Step «plan» fixes the patch and the
// heroes, «bases» counts every hero's base win rate (the matchups' expectation), then one step per hero counts its
// snapshots and per-day counts and replaces them in place; a failed hero is retried alone.

export interface SnapshotPlan {
  patch: number;
  since: number;
  heroes: number[];
}

export async function planSnapshots(repo: HeroStatsRepository, now: number): Promise<SnapshotPlan> {
  const since = now - STATS_KEEP_MS;
  const patch = await repo.currentPatch();
  return { patch, since, heroes: patch === 0 ? [] : await repo.heroes() };
}

/**
 * Rows read per hero and position: the newest first. A Worker has 128 MB; 25 000 parsed rows took ≈ 120 MB in the
 * review (29.10.2026), and the busiest hero at a position is expected near 6 000 in eight weeks.
 */
export const SNAPSHOT_ROWS_MAX = 15_000;

/** Counts and writes one hero's snapshots, one position at a time; returns how many were written. */
export async function snapshotHero(
  repo: HeroStatsRepository,
  plan: SnapshotPlan,
  heroId: number,
  base: ReadonlyMap<string, Rate>,
  now: number
): Promise<number> {
  let written = 0;
  for (let position = 1; position <= 5; position += 1) {
    const rows = await repo.heroRows(heroId, position, plan.since, plan.patch, SNAPSHOT_ROWS_MAX);
    if (rows.length === 0) continue;
    const { snapshots, days } = heroSnapshots(rows, heroId, plan.patch, now, base);
    await repo.writeSnapshots(snapshots, now);
    await repo.writeDays(days);
    written += snapshots.length;
  }
  return written;
}

/** The instance id of a night: one run a UTC day. */
export const snapshotInstanceId = (now: number) => `stats-${new Date(now).toISOString().slice(0, 10)}`;

export class StatsSnapshotWorkflow extends WorkflowEntrypoint<AppEnv, Record<string, never>> {
  async run(
    _event: WorkflowEvent<Record<string, never>>,
    step: WorkflowStep
  ): Promise<{ heroes: number; snapshots: number; failed?: number[] }> {
    const db = this.env.STATS_DB;
    if (db === undefined) return { heroes: 0, snapshots: 0 };
    const repo = createD1HeroStats(db);
    const plan = await step.do('plan', async () => planSnapshots(repo, Date.now()));
    if (plan.heroes.length === 0) return { heroes: 0, snapshots: 0 };
    const entries = await step.do('bases', async () => [
      ...(await repo.baseRates(plan.heroes, plan.since, plan.patch)).entries()
    ]);
    const base = new Map(entries.map(([key, rate]) => [key, { n: rate.matches, w: rate.wins }]));
    let written = 0;
    const failed: number[] = [];
    for (const heroId of plan.heroes)
      try {
        written += await step.do(
          `hero-${heroId}`,
          { retries: { limit: 3, delay: '30 seconds', backoff: 'exponential' }, timeout: '5 minutes' },
          async () => snapshotHero(repo, plan, heroId, base, Date.now())
        );
      } catch (error) {
        // One hero out of retries keeps yesterday's snapshot; the rest of the night goes on.
        failed.push(heroId);
        console.log(
          JSON.stringify({
            component: 'hero_stats',
            operation: 'snapshot',
            status: 'failed',
            heroId,
            errorCode: error instanceof Error ? error.name : 'unknown'
          })
        );
      }
    return { heroes: plan.heroes.length, snapshots: written, failed };
  }
}
