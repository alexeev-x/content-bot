// Short names of the owner's videos (migration 0102, owner 22.10.2026), one per title key shared by the video's
// YouTube and TikTok copies. The AI review names a video once; it never replaces a stored name.

const KEYS_MAX = 60;
export const VIDEO_NAME_MAX = 20;

export interface ContentVideoNameRepository {
  /** The stored names of these title keys. */
  read(keys: readonly string[]): Promise<Map<string, string>>;
  /** Stores the AI's names of keys that have none yet; a stored name, the owner's above all, stays. */
  saveAi(names: readonly { key: string; name: string }[], now: number): Promise<void>;
}

export function createD1ContentVideoNameRepository(db: D1Database): ContentVideoNameRepository {
  return {
    async read(keys) {
      const bounded = [...new Set(keys)].filter((key) => key !== '').slice(0, KEYS_MAX);
      if (bounded.length === 0) return new Map();
      const { results } = await db
        .prepare(
          `SELECT title_key AS key, name FROM content_video_names
           WHERE title_key IN (SELECT value FROM json_each(?1))`
        )
        .bind(JSON.stringify(bounded))
        .all<{ key: string; name: string }>();
      return new Map(results.map((row) => [row.key, row.name]));
    },

    async saveAi(names, now) {
      const rows = names
        .map((row) => ({ key: row.key.slice(0, 500), name: row.name.trim().slice(0, VIDEO_NAME_MAX) }))
        .filter((row) => row.key !== '' && row.name !== '')
        .slice(0, KEYS_MAX);
      if (rows.length === 0) return;
      await db
        .prepare(
          `INSERT OR IGNORE INTO content_video_names (title_key, name, source, updated_at)
           SELECT j.value ->> 'key', j.value ->> 'name', 'ai', ?2 FROM json_each(?1) AS j`
        )
        .bind(JSON.stringify(rows), now)
        .run();
    }
  };
}
