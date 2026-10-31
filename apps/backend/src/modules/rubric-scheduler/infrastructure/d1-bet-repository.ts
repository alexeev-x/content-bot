import type { BetRepository, OpenBet } from '../application/ports';

// «Кого понерфят?» bets (migration 0120): one open at a time (a partial unique index), closed by a conditional UPDATE.

interface Row {
  id: string;
  chain: string;
  hero_ids_json: string;
  post_slot_id: string;
  poll_id: string | null;
  form: 'picture' | 'text';
  opened_at: number;
}

export function createD1BetRepository(db: D1Database): BetRepository {
  return {
    async open(): Promise<OpenBet | null> {
      const row = await db
        .prepare(
          `SELECT id, chain, hero_ids_json, post_slot_id, poll_id, form, opened_at FROM rubric_bets
           WHERE resolved_at IS NULL LIMIT 1`
        )
        .first<Row>();
      return row === null
        ? null
        : {
            id: row.id,
            chain: row.chain,
            heroIds: JSON.parse(row.hero_ids_json) as number[],
            postSlotId: row.post_slot_id,
            pollId: row.poll_id,
            form: row.form,
            openedAt: row.opened_at
          };
    },

    async place({ id, chain, heroIds, postSlotId, pollId, form, now }) {
      const result = await db
        .prepare(
          `INSERT INTO rubric_bets (id, post_slot_id, chain, hero_ids_json, poll_id, form, opened_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7) ON CONFLICT DO NOTHING`
        )
        .bind(id, postSlotId, chain, JSON.stringify(heroIds), pollId, form, now)
        .run();
      return result.meta.changes === 1;
    },

    async resolve({ id, resultSlotId, votes, now }) {
      const result = await db
        .prepare(
          `UPDATE rubric_bets SET resolved_at = ?2, result_slot_id = ?3, votes_json = ?4
           WHERE id = ?1 AND resolved_at IS NULL`
        )
        .bind(id, now, resultSlotId, votes === null || votes === undefined ? null : JSON.stringify(votes))
        .run();
      return result.meta.changes === 1;
    }
  };
}
