export type PublishActionStatus = 'pending' | 'claimed' | 'done' | 'stale';

export interface PublishAction {
  id: string;
  postId: string;
  destinationId: string;
  /** The draft revision the owner saw when the button was made. */
  postRevision: number;
  status: PublishActionStatus;
  publicationId: string | null;
  createdAt: number;
  /** The send-now instant, fixed by the tap that claimed the action; null while pending. */
  usedAt: number | null;
}

// D1 side of the bot's «publish now» buttons. Every transition is conditional, so two taps cannot both
// win a step.
export interface PublishActionStore {
  /**
   * One token per (post, revision, channel): an existing one is reused (and re-armed when it was refused or
   * is still waiting), so a re-sent report never mints a second token. Returns the token per input, in order.
   */
  create(
    actions: { id: string; postId: string; destinationId: string; postRevision: number }[],
    now: number
  ): Promise<string[]>;
  /** Deletes up to `limit` actions created before `before`; returns how many went. */
  purgeOlderThan(before: number, limit: number): Promise<number>;
  find(id: string): Promise<PublishAction | null>;
  /** Moves pending to claimed and fixes `usedAt`. The loser reads the winner's `usedAt` with `find`. */
  claim(id: string, now: number): Promise<boolean>;
  complete(id: string, publicationId: string): Promise<boolean>;
  /** A refusal that cannot change by itself; a finished action is never overwritten. */
  refuse(id: string): Promise<boolean>;
}

interface ActionRow {
  id: string;
  post_id: string;
  destination_id: string;
  post_revision: number;
  status: PublishActionStatus;
  publication_id: string | null;
  created_at: number;
  used_at: number | null;
}

export function createD1PublishActionStore(db: D1Database): PublishActionStore {
  return {
    async create(actions, now) {
      if (actions.length === 0) return [];
      await db.batch(
        actions.flatMap((action) => [
          db
            .prepare(
              `INSERT OR IGNORE INTO bot_publish_actions (id, post_id, destination_id, post_revision, created_at)
               VALUES (?1, ?2, ?3, ?4, ?5)`
            )
            .bind(action.id, action.postId, action.destinationId, action.postRevision, now),
          // A refused token (say, the channel was off for a while) and a waiting one start their day again.
          db
            .prepare(
              `UPDATE bot_publish_actions SET status = 'pending', used_at = NULL, created_at = ?4
                WHERE post_id = ?1 AND post_revision = ?2 AND destination_id = ?3 AND status IN ('pending', 'stale')`
            )
            .bind(action.postId, action.postRevision, action.destinationId, now)
        ])
      );
      const first = actions[0];
      if (first === undefined) return [];
      const { results } = await db
        .prepare(`SELECT id, destination_id FROM bot_publish_actions WHERE post_id = ?1 AND post_revision = ?2`)
        .bind(first.postId, first.postRevision)
        .all<{ id: string; destination_id: string }>();
      return actions.map((action) => {
        const row = results.find((candidate) => candidate.destination_id === action.destinationId);
        if (row === undefined) throw new Error('bot_publish_actions row missing after insert');
        return row.id;
      });
    },

    async purgeOlderThan(before, limit) {
      const result = await db
        .prepare(
          `DELETE FROM bot_publish_actions
            WHERE id IN (SELECT id FROM bot_publish_actions WHERE created_at < ?1 ORDER BY created_at LIMIT ?2)`
        )
        .bind(before, limit)
        .run();
      return result.meta.changes;
    },

    async find(id) {
      const row = await db
        .prepare(
          `SELECT id, post_id, destination_id, post_revision, status, publication_id, created_at, used_at
             FROM bot_publish_actions WHERE id = ?1`
        )
        .bind(id)
        .first<ActionRow>();
      return row === null
        ? null
        : {
            id: row.id,
            postId: row.post_id,
            destinationId: row.destination_id,
            postRevision: row.post_revision,
            status: row.status,
            publicationId: row.publication_id,
            createdAt: row.created_at,
            usedAt: row.used_at
          };
    },

    async claim(id, now) {
      const result = await db
        .prepare(`UPDATE bot_publish_actions SET status = 'claimed', used_at = ?2 WHERE id = ?1 AND status = 'pending'`)
        .bind(id, now)
        .run();
      return result.meta.changes === 1;
    },

    async complete(id, publicationId) {
      const result = await db
        .prepare(
          `UPDATE bot_publish_actions SET status = 'done', publication_id = ?2 WHERE id = ?1 AND status = 'claimed'`
        )
        .bind(id, publicationId)
        .run();
      return result.meta.changes === 1;
    },

    async refuse(id) {
      // A pending action gets its instant here too: the table requires one for every non-pending status.
      const result = await db
        .prepare(
          `UPDATE bot_publish_actions SET status = 'stale', used_at = COALESCE(used_at, created_at)
            WHERE id = ?1 AND status IN ('pending', 'claimed')`
        )
        .bind(id)
        .run();
      return result.meta.changes === 1;
    }
  };
}
