import type { NoticeRepository } from '../application/ports';

// The owner's scheduler notices, one row per key and Moscow day (migration 0119): a failure is told once a day, and at
// most `cap` failures a day before one summary.

export function createD1NoticeRepository(db: D1Database): NoticeRepository {
  return {
    async claim({ key, mskDay, kind, now, cap }) {
      const result = await db
        .prepare(
          `INSERT INTO rubric_notices (key, msk_day, kind, created_at)
           SELECT ?1, ?2, ?3, ?4
           WHERE (SELECT count(*) FROM rubric_notices WHERE msk_day = ?2 AND kind = ?3) < ?5
           ON CONFLICT (key) DO NOTHING`
        )
        .bind(`${mskDay}:${key}`.slice(0, 160), mskDay, kind, now, cap)
        .run();
      return result.meta.changes === 1;
    },

    async purge(before) {
      await db.prepare('DELETE FROM rubric_notices WHERE msk_day < ?1').bind(before).run();
    }
  };
}
