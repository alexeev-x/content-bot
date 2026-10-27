// The joke bank of quiet builds (migration 0115): one joke per build, the newest read back as the writer's examples.

export interface JokeRepository {
  /** The newest jokes, newest first, at most `limit` (≤ 50). */
  recent(limit: number): Promise<string[]>;
  /** Keeps a build's joke; a repeat for the same build changes nothing. */
  save(input: { id: string; build: string; text: string; now: number }): Promise<void>;
}

export function createD1JokeRepository(db: D1Database): JokeRepository {
  return {
    async recent(limit) {
      const { results } = await db
        .prepare('SELECT text FROM quiet_build_jokes ORDER BY created_at DESC LIMIT ?')
        .bind(Math.min(Math.max(limit, 1), 50))
        .all<{ text: string }>();
      return results.map((row) => row.text);
    },
    async save({ id, build, text, now }) {
      await db
        .prepare(
          'INSERT INTO quiet_build_jokes (id, build, text, created_at) VALUES (?, ?, ?, ?) ON CONFLICT (build) DO NOTHING'
        )
        .bind(id, build, text, now)
        .run();
    }
  };
}
