import type { ContentGoalRepository, FollowersRow, GoalRow } from './goals';

export function createD1ContentGoalRepository(db: D1Database): ContentGoalRepository {
  return {
    async read(fromDay) {
      const [goals, followers] = await db.batch([
        db.prepare('SELECT platform, target, set_at AS setAt FROM content_goals'),
        db
          .prepare(
            `SELECT platform, day, followers FROM content_audience_days
             WHERE platform IN ('telegram', 'youtube', 'tiktok')
               -- The window for the pace, plus each platform's latest count even when collection stopped earlier.
               AND (day >= ?1 OR (platform, day) IN (SELECT platform, MAX(day) FROM content_audience_days GROUP BY platform))
             ORDER BY platform, day`
          )
          .bind(fromDay)
      ]);
      return {
        goals: (goals?.results ?? []) as GoalRow[],
        followers: (followers?.results ?? []) as FollowersRow[]
      };
    },

    async set({ platform, target, now }) {
      await db
        .prepare(
          `INSERT INTO content_goals (platform, target, set_at) VALUES (?1, ?2, ?3)
           ON CONFLICT (platform) DO UPDATE SET target = ?2,
             set_at = CASE WHEN content_goals.target = ?2 THEN content_goals.set_at ELSE ?3 END`
        )
        .bind(platform, target, now)
        .run();
    },

    async remove(platform) {
      await db.prepare('DELETE FROM content_goals WHERE platform = ?').bind(platform).run();
    }
  };
}
