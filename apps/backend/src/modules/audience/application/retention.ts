import type { AudienceRepository } from './ports';

// Comment texts, usernames and author keys are kept 10 days (owner, 31.10.2026), threads 14; each post's comment
// counts are frozen first, once the post is 73 h old, so the numbers outlive the texts.

const DAY_MS = 86_400_000;
export const COMMENTS_KEPT_MS = 10 * DAY_MS;
const THREADS_KEPT_MS = 14 * DAY_MS;
const FREEZE_AGE_MS = 73 * 3_600_000;
const FREEZE_BATCH = 100;
const PURGE_BATCH = 200;
const PURGE_ROUNDS = 5;

export async function purgeAudience(deps: { repo: AudienceRepository; now: number }): Promise<{
  frozen: number;
  purged: number;
}> {
  const frozen = await deps.repo.freeze(deps.now, FREEZE_AGE_MS, FREEZE_BATCH);
  let purged = 0;
  for (let round = 0; round < PURGE_ROUNDS; round += 1) {
    const removed = await deps.repo.purge({
      commentsBefore: deps.now - COMMENTS_KEPT_MS,
      threadsBefore: deps.now - THREADS_KEPT_MS,
      limit: PURGE_BATCH
    });
    purged += removed;
    if (removed === 0) break;
  }
  return { frozen, purged };
}
