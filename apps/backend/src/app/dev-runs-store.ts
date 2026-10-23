// DEV only, removed after the check before the release (owner, 23.10.2026): the two statements «Проверка автопостов»
// needs. It lives in app/ with the page's route so the whole feature goes away in one change; it touches the Dota
// announcements and the automatic publishing's idempotency keys, which no module owns together.

const LATEST_LIMIT = 80;

export interface DevRunEventRow {
  externalId: string;
  title: string;
  eventType: string;
  publishedAt: number;
  hadSeries: boolean;
}

export function createDevRunsStore(db: D1Database) {
  return {
    /** Steam's announcements, newest first, the hidden left out. */
    async latestEvents(): Promise<DevRunEventRow[]> {
      const { results } = await db
        .prepare(
          `SELECT external_id, title, event_type, published_at, ai_series_id FROM dota_update_items
            WHERE source_key = 'steam_news' AND hidden_at IS NULL ORDER BY published_at DESC LIMIT ?1`
        )
        .bind(LATEST_LIMIT)
        .all<{
          external_id: string;
          title: string;
          event_type: string;
          published_at: number;
          ai_series_id: string | null;
        }>();
      return results.map((row) => ({
        externalId: row.external_id,
        title: row.title,
        eventType: row.event_type,
        publishedAt: row.published_at,
        hadSeries: row.ai_series_id !== null
      }));
    },

    /**
     * Forgets the automatic publishing's keys of the announcement and its follow-ups, so its new post goes out instead
     * of replaying the old publication (the AI job itself is asked again by the replay's own claim).
     */
    async forgetPublication(externalId: string): Promise<void> {
      await db
        .prepare(
          `DELETE FROM idempotency_keys WHERE scope = 'autopublish' AND (key = ?1 OR key LIKE ?1 || ':follow-up-%')`
        )
        .bind(`autopublish:${externalId}`)
        .run();
    }
  };
}
