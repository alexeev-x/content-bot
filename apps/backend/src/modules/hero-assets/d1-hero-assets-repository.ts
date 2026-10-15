import { HERO_ASSET_KINDS, type HeroAssetKind, type HeroAssetStatus } from '@alexeev/contracts';

export interface HeroRow {
  slug: string;
  id: number;
  name: string;
}

export interface HeroAssetRow {
  slug: string;
  kind: HeroAssetKind;
  heroId: number;
  heroName: string;
  status: HeroAssetStatus;
  size: number | null;
  errorCode: string | null;
}

export interface HeroAssetRepository {
  /** Adds a row per hero and kind; an existing row only gets the hero's current name. One statement. */
  upsertHeroes(heroes: readonly HeroRow[], now: number): Promise<void>;
  /** Moves up to `limit` due rows `leaseMs` forward and returns them: the caller that won owns them. */
  claimDue(
    now: number,
    limit: number,
    leaseMs: number
  ): Promise<{ slug: string; kind: HeroAssetKind; attempts: number }[]>;
  finish(input: {
    slug: string;
    kind: HeroAssetKind;
    now: number;
    status: 'stored' | 'missing' | 'failed';
    nextAttemptAt: number;
    size?: number;
    contentType?: string;
    errorCode?: string;
  }): Promise<void>;
  /** Files Valve did not have are queued again (the owner asked to check). */
  requeueMissing(now: number): Promise<void>;
  list(): Promise<HeroAssetRow[]>;
  status(slug: string, kind: HeroAssetKind): Promise<HeroAssetStatus | null>;
}

interface RawRow {
  hero_slug: string;
  kind: HeroAssetKind;
  hero_id: number;
  hero_name: string;
  status: HeroAssetStatus;
  size: number | null;
  error_code: string | null;
}

export function createD1HeroAssetRepository(db: D1Database): HeroAssetRepository {
  return {
    async upsertHeroes(heroes, now) {
      if (heroes.length === 0) return;
      // Heroes × kinds from two JSON arrays: one statement and two parameters whatever the hero count.
      await db
        .prepare(
          `INSERT INTO dota_hero_assets (hero_slug, kind, hero_id, hero_name, next_attempt_at, updated_at)
           SELECT json_extract(h.value, '$.slug'), k.value, json_extract(h.value, '$.id'),
                  json_extract(h.value, '$.name'), ?3, ?3
           FROM json_each(?1) AS h CROSS JOIN json_each(?2) AS k
           WHERE true
           ON CONFLICT (hero_slug, kind) DO UPDATE SET hero_id = excluded.hero_id, hero_name = excluded.hero_name`
        )
        .bind(JSON.stringify(heroes), JSON.stringify(HERO_ASSET_KINDS), now)
        .run();
    },

    async claimDue(now, limit, leaseMs) {
      if (limit <= 0) return [];
      const rows = await db
        .prepare(
          `UPDATE dota_hero_assets SET next_attempt_at = ?1 + ?3, attempts = attempts + 1, updated_at = ?1
           WHERE (hero_slug, kind) IN (
             SELECT hero_slug, kind FROM dota_hero_assets INDEXED BY dota_hero_assets_due_idx
             WHERE status IN ('pending', 'failed', 'missing') AND status <> 'missing' AND next_attempt_at <= ?1
             ORDER BY next_attempt_at LIMIT ?2
           ) AND next_attempt_at <= ?1
           RETURNING hero_slug, kind, attempts`
        )
        .bind(now, limit, leaseMs)
        .all<{ hero_slug: string; kind: HeroAssetKind; attempts: number }>();
      return rows.results.map((row) => ({ slug: row.hero_slug, kind: row.kind, attempts: row.attempts }));
    },

    async finish(input) {
      await db
        .prepare(
          `UPDATE dota_hero_assets
           SET status = ?3, next_attempt_at = ?4, size = COALESCE(?5, size), content_type = COALESCE(?6, content_type),
               error_code = ?7, attempts = CASE WHEN ?3 = 'stored' THEN 0 ELSE attempts END, updated_at = ?8
           WHERE hero_slug = ?1 AND kind = ?2`
        )
        .bind(
          input.slug,
          input.kind,
          input.status,
          input.nextAttemptAt,
          input.size ?? null,
          input.contentType ?? null,
          input.errorCode ?? null,
          input.now
        )
        .run();
    },

    async requeueMissing(now) {
      await db
        .prepare(
          `UPDATE dota_hero_assets SET status = 'pending', next_attempt_at = ?1, error_code = NULL, updated_at = ?1
           WHERE status = 'missing'`
        )
        .bind(now)
        .run();
    },

    async list() {
      const rows = await db
        .prepare(
          `SELECT hero_slug, kind, hero_id, hero_name, status, size, error_code FROM dota_hero_assets
           ORDER BY hero_name, hero_slug, kind LIMIT 2000`
        )
        .all<RawRow>();
      return rows.results.map((row) => ({
        slug: row.hero_slug,
        kind: row.kind,
        heroId: row.hero_id,
        heroName: row.hero_name,
        status: row.status,
        size: row.size,
        errorCode: row.error_code
      }));
    },

    async status(slug, kind) {
      const row = await db
        .prepare('SELECT status FROM dota_hero_assets WHERE hero_slug = ? AND kind = ?')
        .bind(slug, kind)
        .first<{ status: HeroAssetStatus }>();
      return row?.status ?? null;
    }
  };
}
