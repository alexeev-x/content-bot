import type { AiUsageKind } from '@alexeev/contracts';
import type { UsageRow } from './ports';

export interface StoredSettings {
  document: string;
  revision: number;
  updatedAt: number;
}

export interface SpendRows {
  /** Per kind, this month. */
  byKind: { kind: AiUsageKind; requests: number; costMicroUsd: number; unpriced: number }[];
  todayMicroUsd: number;
}

export interface AiRepository {
  readSettings(): Promise<StoredSettings | null>;
  /** Guarded by the revision: false when another save won. */
  saveSettings(input: { document: string; expectedRevision: number; now: number }): Promise<boolean>;
  recordUsage(row: UsageRow): Promise<void>;
  /** The recorded cost of these usage rows (at most 100), in micro-USD; an unpriced row maps to null. */
  costsOf(ids: readonly string[]): Promise<Map<string, number | null>>;
  readSpend(input: { monthStart: number; dayStart: number }): Promise<SpendRows>;
  /** Marks a budget alert as sent; false when it already was (one per period). */
  claimBudgetAlert(id: string, now: number): Promise<boolean>;
  readLastCheck(): Promise<{ at: number; ok: boolean; model: string | null; errorCode: string | null } | null>;
  saveCheck(input: { at: number; ok: boolean; model: string | null; errorCode: string | null }): Promise<void>;
}

export function createD1AiRepository(db: D1Database): AiRepository {
  return {
    async readSettings() {
      const row = await db
        .prepare('SELECT document, revision, updated_at AS updatedAt FROM ai_settings WHERE id = 1')
        .first<StoredSettings>();
      return row ?? null;
    },

    async saveSettings({ document, expectedRevision, now }) {
      const result =
        expectedRevision === 0
          ? await db
              .prepare('INSERT OR IGNORE INTO ai_settings (id, document, revision, updated_at) VALUES (1, ?, 1, ?)')
              .bind(document, now)
              .run()
          : await db
              .prepare(
                'UPDATE ai_settings SET document = ?1, revision = revision + 1, updated_at = ?2 WHERE id = 1 AND revision = ?3'
              )
              .bind(document, now, expectedRevision)
              .run();
      return result.meta.changes === 1;
    },

    async recordUsage(row) {
      await db
        .prepare(
          `INSERT INTO ai_usage (id, at, kind, provider, model, input_tokens, cached_input_tokens, cache_write_tokens, output_tokens, cost_micro_usd)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          row.id,
          row.at,
          row.kind,
          row.provider,
          row.model,
          row.usage.inputTokens,
          row.usage.cachedInputTokens,
          row.usage.cacheWriteTokens,
          row.usage.outputTokens,
          row.costMicroUsd
        )
        .run();
    },

    async costsOf(ids) {
      if (ids.length === 0) return new Map();
      const rows = await db
        .prepare(
          'SELECT id, cost_micro_usd AS cost FROM ai_usage WHERE id IN (SELECT value FROM json_each(?1)) LIMIT 100'
        )
        .bind(JSON.stringify(ids.slice(0, 100)))
        .all<{ id: string; cost: number | null }>();
      return new Map(rows.results.map((row) => [row.id, row.cost]));
    },

    async readSpend({ monthStart, dayStart }) {
      const [kinds, today] = await db.batch([
        db
          .prepare(
            `SELECT kind, COUNT(*) AS requests, COALESCE(SUM(cost_micro_usd), 0) AS costMicroUsd,
                    SUM(CASE WHEN cost_micro_usd IS NULL THEN 1 ELSE 0 END) AS unpriced
             FROM ai_usage WHERE at >= ? GROUP BY kind`
          )
          .bind(monthStart),
        db.prepare('SELECT COALESCE(SUM(cost_micro_usd), 0) AS total FROM ai_usage WHERE at >= ?').bind(dayStart)
      ]);
      return {
        byKind: (kinds?.results ?? []) as SpendRows['byKind'],
        todayMicroUsd: ((today?.results ?? [])[0] as { total: number } | undefined)?.total ?? 0
      };
    },

    async claimBudgetAlert(id, now) {
      const result = await db
        .prepare('INSERT OR IGNORE INTO ai_budget_alerts (id, sent_at) VALUES (?, ?)')
        .bind(id, now)
        .run();
      return result.meta.changes === 1;
    },

    async readLastCheck() {
      const row = await db
        .prepare('SELECT checked_at AS at, ok, model, error_code AS errorCode FROM ai_connection_checks WHERE id = 1')
        .first<{ at: number; ok: number; model: string | null; errorCode: string | null }>();
      return row === null ? null : { ...row, ok: row.ok === 1 };
    },

    async saveCheck({ at, ok, model, errorCode }) {
      await db
        .prepare(
          `INSERT INTO ai_connection_checks (id, checked_at, ok, model, error_code) VALUES (1, ?1, ?2, ?3, ?4)
           ON CONFLICT (id) DO UPDATE SET checked_at = ?1, ok = ?2, model = ?3, error_code = ?4`
        )
        .bind(at, ok ? 1 : 0, model, errorCode)
        .run();
    }
  };
}
