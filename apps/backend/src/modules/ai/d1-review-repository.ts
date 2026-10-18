import type { AiReviewLimit } from '@alexeev/contracts';

export type ReviewStatus = 'pending' | 'claimed' | 'ready' | 'limited';

export interface ReviewRow {
  itemId: string;
  status: ReviewStatus;
  limitedReason: AiReviewLimit | null;
  facts: string | null;
  observation: string | null;
  hypotheses: string;
  nextTest: string | null;
  model: string | null;
  /** From the usage row of the model call, in micro-USD; null without a call or a price. */
  costMicroUsd: number | null;
  createdAt: number;
}

export interface ReviewResult {
  itemId: string;
  /** The lease the writer claimed with: a result is stored only while it still holds it. */
  leaseUntil: number;
  now: number;
  status: 'ready' | 'limited';
  limitedReason: AiReviewLimit | null;
  facts: string;
  observation: string;
  hypotheses: string;
  nextTest: string | null;
  model: string | null;
  usageId: string | null;
}

export interface ReviewRepository {
  /** Adds a pending row per id; an existing row (in any state) stays as it is. Returns how many were new. */
  enqueue(ids: readonly string[], now: number): Promise<number>;
  /**
   * Claims the oldest due row (pending, or claimed with an expired lease) with a conditional update; counts the
   * attempt. Null when nothing is due or another tick won every candidate.
   */
  claimNext(input: { now: number; leaseUntil: number }): Promise<{ itemId: string; attempts: number } | null>;
  /** Stores the final result; false when the lease was lost (another tick owns the row now). */
  finish(input: ReviewResult): Promise<boolean>;
  /** Gives a failed attempt back for the next tick; false when the lease was lost. */
  release(input: { itemId: string; leaseUntil: number; now: number }): Promise<boolean>;
  find(itemId: string): Promise<ReviewRow | null>;
  /**
   * Puts back to pending at most `limit` reviews among `ids` that were limited only because reviews were off or the
   * budget refused: once the owner turns reviews on, videos still in the window get their hypotheses. Returns how many.
   */
  reopenWaiting(input: { ids: readonly string[]; limit: number; now: number }): Promise<number>;
}

const CANDIDATES = 3;

export function createD1ReviewRepository(db: D1Database): ReviewRepository {
  return {
    async reopenWaiting({ ids, limit, now }) {
      if (ids.length === 0 || limit <= 0) return 0;
      const result = await db
        .prepare(
          `UPDATE ai_video_reviews
             SET status = 'pending', limited_reason = NULL, facts_json = NULL, observation_json = NULL,
                 hypotheses_json = '[]', next_test = NULL, model = NULL, usage_id = NULL, claim_until = NULL,
                 attempts = 0, updated_at = ?3
           WHERE item_id IN (
             SELECT item_id FROM ai_video_reviews
             WHERE status = 'limited' AND limited_reason IN ('reviews_off', 'budget')
               AND item_id IN (SELECT value FROM json_each(?1))
             ORDER BY created_at, item_id LIMIT ?2
           ) AND status = 'limited' AND limited_reason IN ('reviews_off', 'budget')`
        )
        .bind(JSON.stringify(ids), limit, now)
        .run();
      return result.meta.changes;
    },

    async enqueue(ids, now) {
      if (ids.length === 0) return 0;
      const result = await db
        .prepare(
          `INSERT OR IGNORE INTO ai_video_reviews (item_id, status, attempts, created_at, updated_at)
           SELECT value, 'pending', 0, ?2, ?2 FROM json_each(?1)`
        )
        .bind(JSON.stringify(ids), now)
        .run();
      return result.meta.changes;
    },

    async claimNext({ now, leaseUntil }) {
      const due = await db
        .prepare(
          `SELECT item_id AS itemId FROM ai_video_reviews
           WHERE status = 'pending' OR (status = 'claimed' AND claim_until < ?1)
           ORDER BY created_at, item_id LIMIT ?2`
        )
        .bind(now, CANDIDATES)
        .all<{ itemId: string }>();
      // Each candidate is a conditional update: the tick that wins it owns it, the others see no change.
      for (const { itemId } of due.results) {
        const won = await db
          .prepare(
            `UPDATE ai_video_reviews
             SET status = 'claimed', claim_until = ?1, attempts = attempts + 1, updated_at = ?2
             WHERE item_id = ?3 AND (status = 'pending' OR (status = 'claimed' AND claim_until < ?2))
             RETURNING attempts`
          )
          .bind(leaseUntil, now, itemId)
          .all<{ attempts: number }>();
        const attempts = won.results[0]?.attempts;
        if (won.meta.changes === 1 && attempts !== undefined) return { itemId, attempts };
      }
      return null;
    },

    async finish(result) {
      const done = await db
        .prepare(
          `UPDATE ai_video_reviews
           SET status = ?1, claim_until = NULL, limited_reason = ?2, facts_json = ?3, observation_json = ?4,
               hypotheses_json = ?5, next_test = ?6, model = ?7, usage_id = ?8, updated_at = ?9
           WHERE item_id = ?10 AND status = 'claimed' AND claim_until = ?11`
        )
        .bind(
          result.status,
          result.limitedReason,
          result.facts,
          result.observation,
          result.hypotheses,
          result.nextTest,
          result.model,
          result.usageId,
          result.now,
          result.itemId,
          result.leaseUntil
        )
        .run();
      return done.meta.changes === 1;
    },

    async release({ itemId, leaseUntil, now }) {
      const done = await db
        .prepare(
          `UPDATE ai_video_reviews SET status = 'pending', claim_until = NULL, updated_at = ?1
           WHERE item_id = ?2 AND status = 'claimed' AND claim_until = ?3`
        )
        .bind(now, itemId, leaseUntil)
        .run();
      return done.meta.changes === 1;
    },

    async find(itemId) {
      const row = await db
        .prepare(
          `SELECT r.item_id AS itemId, r.status, r.limited_reason AS limitedReason, r.facts_json AS facts,
                  r.observation_json AS observation, r.hypotheses_json AS hypotheses, r.next_test AS nextTest,
                  r.model, u.cost_micro_usd AS costMicroUsd, r.created_at AS createdAt
           FROM ai_video_reviews r LEFT JOIN ai_usage u ON u.id = r.usage_id
           WHERE r.item_id = ?1`
        )
        .bind(itemId)
        .first<ReviewRow>();
      return row ?? null;
    }
  };
}
