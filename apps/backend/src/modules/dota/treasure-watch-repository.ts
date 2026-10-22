// The Liquipedia watch of a treasure announced without its own page (migration 0101, owner 22.10.2026).

const WATCH_MS = 6 * 60 * 60 * 1000;
const MAX_FACTS = 80;

/** A fact kind of a treasure. */
export type TreasureFactKind = 'sets' | 'bonuses' | 'drop_rates' | 'price';
/**
 * Facts by key, `<kind>:<item>` (`sets:<set name>`, `bonuses:<condition>`, `drop_rates:`, `price:`), each its text as
 * it would be told. A key once told is never told again, even when its text changes later.
 */
export type TreasureFactTexts = Record<string, string>;

export const factKind = (key: string): TreasureFactKind | null => {
  const kind = key.slice(0, key.indexOf(':'));
  return kind === 'sets' || kind === 'bonuses' || kind === 'drop_rates' || kind === 'price' ? kind : null;
};

export interface TreasureWatch {
  externalId: string;
  title: string;
  startedAt: number;
  endsAt: number;
  pageTitle: string | null;
  lastRevision: number | null;
  lastChangeAt: number | null;
  /** When a run last took the watch; a run claims it by this value. */
  checkedAt: number | null;
  published: TreasureFactTexts;
  pending: TreasureFactTexts;
  posts: number;
  /** The event got its own page's series: its treasure is told there, the watch stops. */
  hasSeries: boolean;
  /** The owner hid the event: nothing more is told about it. */
  hidden: boolean;
  /** The event's own post went out to a channel; a follow-up waits for it. */
  mainTold: boolean;
}

export interface TreasureWatchRepository {
  /** Starts a watch for each visible treasure announced in the last 6 hours that has none yet; how many started. */
  startRecent(now: number): Promise<number>;
  /** Watches still running, the least recently checked first. */
  active(limit: number): Promise<TreasureWatch[]>;
  /**
   * Takes the watch for this run when no other run took it since it was read; with `quietSince`, only when no watch at
   * all was taken after that time (one run at a time talks to Liquipedia).
   */
  claim(watch: TreasureWatch, now: number, quietSince: number | null): Promise<boolean>;
  /** Saves the watch as of the run that claimed it at `claimedAt`; false when another run took it since. */
  save(watch: TreasureWatch, claimedAt: number, done: boolean): Promise<boolean>;
}

interface Row {
  external_id: string;
  title: string;
  started_at: number;
  ends_at: number;
  page_title: string | null;
  last_revision: number | null;
  last_change_at: number | null;
  checked_at: number | null;
  published_json: string;
  pending_json: string;
  posts: number;
  has_series: number;
  hidden: number;
  main_told: number;
}

const facts = (json: string): TreasureFactTexts => {
  try {
    const parsed: unknown = JSON.parse(json);
    if (parsed === null || typeof parsed !== 'object') return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>)
        .filter(
          (entry): entry is [string, string] =>
            factKind(entry[0]) !== null && typeof entry[1] === 'string' && entry[1].length <= 1_000
        )
        .slice(0, MAX_FACTS)
    );
  } catch {
    return {};
  }
};

export function createD1TreasureWatchRepository(db: D1Database): TreasureWatchRepository {
  return {
    async startRecent(now) {
      const result = await db
        .prepare(
          `INSERT OR IGNORE INTO treasure_watches (external_id, title, started_at, ends_at)
           SELECT external_id, title, published_at, published_at + ?2 FROM dota_update_items
           WHERE source_key = 'steam_news' AND event_type = 'treasure' AND is_baseline = 0 AND hidden_at IS NULL
             AND published_at > ?1 - ?2 AND published_at <= ?1`
        )
        .bind(now, WATCH_MS)
        .run();
      return result.meta.changes;
    },

    async active(limit) {
      // «Told» is a confirmed send of the event's own post; a scheduled one has not gone out yet.
      const { results } = await db
        .prepare(
          `SELECT w.external_id, w.title, w.started_at, w.ends_at, w.page_title, w.last_revision, w.last_change_at,
                  w.checked_at, w.published_json, w.pending_json, w.posts,
                  u.ai_series_id IS NOT NULL AS has_series,
                  u.hidden_at IS NOT NULL AS hidden,
                  EXISTS (SELECT 1 FROM publications pu JOIN jobs j ON j.publication_id = pu.id
                          WHERE pu.post_id = u.draft_post_id AND j.status = 'succeeded') AS main_told
           FROM treasure_watches w
           JOIN dota_update_items u ON u.source_key = w.source_key AND u.external_id = w.external_id
           WHERE w.status = 'watching' ORDER BY coalesce(w.checked_at, 0) LIMIT ?1`
        )
        .bind(Math.min(limit, 5))
        .all<Row>();
      return results.map((row) => ({
        externalId: row.external_id,
        title: row.title,
        startedAt: row.started_at,
        endsAt: row.ends_at,
        pageTitle: row.page_title,
        lastRevision: row.last_revision,
        lastChangeAt: row.last_change_at,
        checkedAt: row.checked_at,
        published: facts(row.published_json),
        pending: facts(row.pending_json),
        posts: row.posts,
        hasSeries: row.has_series === 1,
        hidden: row.hidden === 1,
        mainTold: row.main_told === 1
      }));
    },

    async claim(watch, now, quietSince) {
      const result = await db
        .prepare(
          `UPDATE treasure_watches SET checked_at = ?2
           WHERE external_id = ?1 AND status = 'watching' AND checked_at IS ?3
             AND (?4 IS NULL OR NOT EXISTS (SELECT 1 FROM treasure_watches o WHERE o.checked_at > ?4))`
        )
        .bind(watch.externalId, now, watch.checkedAt, quietSince)
        .run();
      if (result.meta.changes !== 1) return false;
      watch.checkedAt = now;
      return true;
    },

    async save(watch, claimedAt, done) {
      const result = await db
        .prepare(
          `UPDATE treasure_watches
           SET page_title = ?2, last_revision = ?3, last_change_at = ?4, published_json = ?5, pending_json = ?6,
               posts = ?7, status = ?8
           WHERE external_id = ?1 AND status = 'watching' AND checked_at = ?9`
        )
        .bind(
          watch.externalId,
          watch.pageTitle,
          watch.lastRevision,
          watch.lastChangeAt,
          JSON.stringify(watch.published),
          JSON.stringify(watch.pending),
          Math.min(watch.posts, 2),
          done ? 'done' : 'watching',
          claimedAt
        )
        .run();
      return result.meta.changes === 1;
    }
  };
}
