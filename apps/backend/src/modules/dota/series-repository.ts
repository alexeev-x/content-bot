// The planned series of posts about one Dota event (migration 0092, `docs/backend/sources.md` «Series»).

export interface SeriesPostRow {
  id: string;
  seriesId: string;
  externalId: string;
  position: number;
  topic: string;
  task: string;
  /** Valve CDN URLs chosen for this post. */
  media: string[];
  status: 'writing' | 'ready' | 'failed';
  generationId: string | null;
  postId: string | null;
}

export interface SeriesView {
  id: string;
  title: string;
  pageUrl: string;
  posts: SeriesPostRow[];
}

export interface SeriesRepository {
  /** Stores the plan and makes it the event's series, atomically. */
  create(input: {
    id: string;
    externalId: string;
    title: string;
    pageUrl: string;
    now: number;
    /** From Cron's first draft of a new event: may be published without the owner (migration 0100). */
    automatic?: boolean;
    posts: { id: string; position: number; topic: string; task: string; media: string[] }[];
  }): Promise<void>;
  findPost(id: string): Promise<SeriesPostRow | null>;
  /** The writer finished one post (a draft or a failure); only a post still writing changes. */
  finishPost(input: {
    id: string;
    status: 'ready' | 'failed';
    generationId: string | null;
    factCheck?: 'clean' | 'fixed' | 'unchecked' | null;
  }): Promise<void>;
  /**
   * Once per series, when no post is writing any more: the title and how many posts have a draft. Null while one
   * is still writing or when the notice was claimed before.
   */
  claimNotice(
    seriesId: string,
    now: number
  ): Promise<{ title: string; total: number; ready: number; automatic: boolean; clean: number } | null>;
  /** The series's posts in order. */
  posts(seriesId: string): Promise<SeriesPostRow[]>;
  /** The event's current series, its posts in order. */
  latest(externalId: string, now: number): Promise<SeriesView | null>;
  /** The owner approved a post of the series: its studio post. */
  setPost(input: { id: string; postId: string }): Promise<void>;
}

interface PostDbRow {
  id: string;
  series_id: string;
  external_id: string;
  position: number;
  topic: string;
  task: string;
  media_json: string;
  status: SeriesPostRow['status'];
  generation_id: string | null;
  post_id: string | null;
}

const POST_COLUMNS = `p.id, p.series_id, s.external_id, p.position, p.topic, p.task, p.media_json, p.status, p.generation_id,
  p.post_id, p.created_at`;

/** Longer than a queue consumer's 15 minutes of wall time. */
const WRITING_LOST_MS = 20 * 60_000;

function toPost(row: PostDbRow): SeriesPostRow {
  let media: string[] = [];
  try {
    const parsed: unknown = JSON.parse(row.media_json);
    if (Array.isArray(parsed)) media = parsed.filter((item): item is string => typeof item === 'string');
  } catch {
    media = [];
  }
  return {
    id: row.id,
    seriesId: row.series_id,
    externalId: row.external_id,
    position: row.position,
    topic: row.topic,
    task: row.task,
    media,
    status: row.status,
    generationId: row.generation_id,
    postId: row.post_id
  };
}

export function createD1SeriesRepository(db: D1Database): SeriesRepository {
  return {
    async create({ id, externalId, title, pageUrl, now, automatic, posts }) {
      await db.batch([
        db
          .prepare(
            `INSERT INTO source_series (id, source_key, external_id, title, page_url, posts_total, created_at, automatic)
             VALUES (?1, 'steam_news', ?2, ?3, ?4, ?5, ?6, ?7)`
          )
          .bind(id, externalId, title.slice(0, 500), pageUrl, posts.length, now, automatic === true ? 1 : 0),
        ...posts.map((post) =>
          db
            .prepare(
              `INSERT INTO source_series_posts (id, series_id, position, topic, task, media_json, created_at)
               VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
            )
            .bind(
              post.id,
              id,
              post.position,
              post.topic.slice(0, 120),
              post.task.slice(0, 4000),
              JSON.stringify(post.media),
              now
            )
        ),
        db
          .prepare(
            `UPDATE dota_update_items SET ai_series_id = ?1 WHERE source_key = 'steam_news' AND external_id = ?2`
          )
          .bind(id, externalId)
      ]);
    },

    async findPost(id) {
      const row = await db
        .prepare(
          `SELECT ${POST_COLUMNS} FROM source_series_posts p JOIN source_series s ON s.id = p.series_id WHERE p.id = ?1`
        )
        .bind(id)
        .first<PostDbRow>();
      return row === null ? null : toPost(row);
    },

    async finishPost({ id, status, generationId, factCheck }) {
      await db
        .prepare(
          `UPDATE source_series_posts SET status = ?2, generation_id = ?3, fact_check = ?4
           WHERE id = ?1 AND status = 'writing'`
        )
        .bind(id, status, generationId, factCheck ?? null)
        .run();
    },

    async posts(seriesId) {
      const { results } = await db
        .prepare(
          `SELECT ${POST_COLUMNS} FROM source_series_posts p JOIN source_series s ON s.id = p.series_id
           WHERE p.series_id = ?1 ORDER BY p.position LIMIT 6`
        )
        .bind(seriesId)
        .all<PostDbRow>();
      return results.map(toPost);
    },

    async claimNotice(seriesId, now) {
      const row = await db
        .prepare(
          `UPDATE source_series SET notified_at = ?2
           WHERE id = ?1 AND notified_at IS NULL
             AND NOT EXISTS (SELECT 1 FROM source_series_posts WHERE series_id = ?1 AND status = 'writing')
           RETURNING title, posts_total, automatic,
             (SELECT count(*) FROM source_series_posts WHERE series_id = ?1 AND status = 'ready') AS ready,
             (SELECT count(*) FROM source_series_posts
              WHERE series_id = ?1 AND status = 'ready' AND fact_check = 'clean') AS clean`
        )
        .bind(seriesId, now)
        .first<{ title: string; posts_total: number; ready: number; automatic: number; clean: number }>();
      return row === null
        ? null
        : {
            title: row.title,
            total: row.posts_total,
            ready: row.ready,
            automatic: row.automatic === 1,
            clean: row.clean
          };
    },

    async latest(externalId, now) {
      const series = await db
        .prepare(
          `SELECT s.id, s.title, s.page_url FROM dota_update_items u JOIN source_series s ON s.id = u.ai_series_id
           WHERE u.source_key = 'steam_news' AND u.external_id = ?1`
        )
        .bind(externalId)
        .first<{ id: string; title: string; page_url: string }>();
      if (series === null) return null;
      const { results } = await db
        .prepare(
          `SELECT ${POST_COLUMNS} FROM source_series_posts p JOIN source_series s ON s.id = p.series_id
           WHERE p.series_id = ?1 ORDER BY p.position LIMIT 6`
        )
        .bind(series.id)
        .all<PostDbRow & { created_at: number }>();
      // A job that died mid-write (no retries on this queue) leaves its post «writing»; past a queue job's wall
      // time it reads as failed, so the studio stops waiting and the series can be asked for again.
      const posts = results.map((row) => {
        const post = toPost(row);
        return post.status === 'writing' && row.created_at < now - WRITING_LOST_MS
          ? { ...post, status: 'failed' as const }
          : post;
      });
      return { id: series.id, title: series.title, pageUrl: series.page_url, posts };
    },

    async setPost({ id, postId }) {
      await db
        .prepare('UPDATE source_series_posts SET post_id = ?2 WHERE id = ?1 AND post_id IS NULL')
        .bind(id, postId)
        .run();
    }
  };
}
