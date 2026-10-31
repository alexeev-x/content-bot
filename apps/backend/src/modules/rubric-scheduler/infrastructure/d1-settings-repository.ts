import type { RubricSettingRow, SchedulerSettings, SchedulerSettingsRepository } from '../application/ports';

// The switch, each rubric's rest and the periodic step markers (migration 0119). Every change is conditional: on the
// revision the owner saw, or on the marker still being due.

interface SettingsRow {
  enabled: number;
  destination_id: string | null;
  horoscope_anchor_week: string | null;
  off_cleanup_done: number;
  revision: number;
  updated_at: number;
}

interface RubricRow {
  rubric_key: string;
  enabled: number;
  base_rest_days: number;
  rest_days: number;
  rest_source: 'default' | 'manual' | 'learned';
  last_sent_at: number | null;
  last_sent_seeded: number;
  last_failed_at: number | null;
  last_fail_code: string | null;
  skip_until: number | null;
  paused_reason: 'BANK_EXHAUSTED' | null;
  revision: number;
  updated_at: number;
}

const toRubric = (row: RubricRow): RubricSettingRow => ({
  rubricKey: row.rubric_key,
  enabled: row.enabled === 1,
  baseRestDays: row.base_rest_days,
  restDays: row.rest_days,
  restSource: row.rest_source,
  lastSentAt: row.last_sent_at,
  lastSentSeeded: row.last_sent_seeded === 1,
  lastFailedAt: row.last_failed_at,
  lastFailCode: row.last_fail_code,
  skipUntil: row.skip_until,
  pausedReason: row.paused_reason,
  revision: row.revision,
  updatedAt: row.updated_at
});

export function createD1SchedulerSettingsRepository(db: D1Database): SchedulerSettingsRepository {
  return {
    async read(): Promise<SchedulerSettings> {
      const row = await db
        .prepare(
          `SELECT enabled, destination_id, horoscope_anchor_week, off_cleanup_done, revision, updated_at
           FROM rubric_scheduler_settings WHERE id = 1`
        )
        .first<SettingsRow>();
      return {
        enabled: row?.enabled === 1,
        destinationId: row?.destination_id ?? null,
        horoscopeAnchorWeek: row?.horoscope_anchor_week ?? null,
        offCleanupDone: (row?.off_cleanup_done ?? 1) === 1,
        revision: row?.revision ?? 0,
        updatedAt: row?.updated_at ?? 0
      };
    },

    // Switching off leaves the live slots to one cleanup pass (`off_cleanup_done = 0`).
    async update({ enabled, destinationId, horoscopeAnchorWeek, revision, now }) {
      const result = await db
        .prepare(
          `UPDATE rubric_scheduler_settings
           SET enabled = ?1, destination_id = ?2, horoscope_anchor_week = coalesce(horoscope_anchor_week, ?3),
               off_cleanup_done = CASE WHEN ?1 = 0 AND enabled = 1 THEN 0 ELSE off_cleanup_done END,
               revision = revision + 1, updated_at = ?4
           WHERE id = 1 AND revision = ?5`
        )
        .bind(enabled ? 1 : 0, destinationId, horoscopeAnchorWeek, now, revision)
        .run();
      return result.meta.changes === 1;
    },

    async markCleanupDone(now) {
      await db
        .prepare('UPDATE rubric_scheduler_settings SET off_cleanup_done = 1, updated_at = ?1 WHERE id = 1')
        .bind(now)
        .run();
    },

    async rubrics() {
      const { results } = await db
        .prepare(
          `SELECT rubric_key, enabled, base_rest_days, rest_days, rest_source, last_sent_at, last_sent_seeded,
                  last_failed_at, last_fail_code, skip_until, paused_reason, revision, updated_at
           FROM rubric_settings ORDER BY rubric_key LIMIT 64`
        )
        .all<RubricRow>();
      return results.map(toRubric);
    },

    async seedRubrics(rows, now) {
      if (rows.length === 0) return;
      await db.batch(
        rows.map((row) =>
          db
            .prepare(
              `INSERT OR IGNORE INTO rubric_settings
                 (rubric_key, base_rest_days, rest_days, last_sent_at, last_sent_seeded, updated_at)
               VALUES (?1, ?2, ?2, ?3, ?4, ?5)`
            )
            .bind(row.rubricKey, row.restDays, row.lastSentAt, row.seeded ? 1 : 0, now)
        )
      );
    },

    async updateRubric({ rubricKey, revision, enabled, restDays, lastSentAt, now }) {
      const result = await db
        .prepare(
          `UPDATE rubric_settings
           SET enabled = coalesce(?3, enabled),
               rest_days = coalesce(?4, rest_days),
               rest_source = CASE WHEN ?4 IS NULL THEN rest_source ELSE 'manual' END,
               last_sent_at = coalesce(?5, last_sent_at),
               last_sent_seeded = CASE WHEN ?5 IS NULL THEN last_sent_seeded ELSE 1 END,
               paused_reason = CASE WHEN ?3 = 1 THEN NULL ELSE paused_reason END,
               revision = revision + 1, updated_at = ?6
           WHERE rubric_key = ?1 AND revision = ?2`
        )
        .bind(
          rubricKey,
          revision,
          enabled === undefined ? null : enabled ? 1 : 0,
          restDays ?? null,
          lastSentAt ?? null,
          now
        )
        .run();
      return result.meta.changes === 1;
    },

    async rubricSent(rubricKey, at) {
      await db
        .prepare(
          `UPDATE rubric_settings SET last_sent_at = max(coalesce(last_sent_at, 0), ?2), last_sent_seeded = 0,
             updated_at = ?2 WHERE rubric_key = ?1`
        )
        .bind(rubricKey, at)
        .run();
    },

    async rubricFailed(rubricKey, at, code) {
      await db
        .prepare(
          'UPDATE rubric_settings SET last_failed_at = ?2, last_fail_code = ?3, updated_at = ?2 WHERE rubric_key = ?1'
        )
        .bind(rubricKey, at, code.slice(0, 60))
        .run();
    },

    async rubricSkipped(rubricKey, until) {
      await db.prepare('UPDATE rubric_settings SET skip_until = ?2 WHERE rubric_key = ?1').bind(rubricKey, until).run();
    },

    async pauseRubric(rubricKey, now, bankSize) {
      await db
        .prepare(
          `UPDATE rubric_settings SET paused_reason = 'BANK_EXHAUSTED', paused_at = ?2, bank_size_at_pause = ?3,
             updated_at = ?2 WHERE rubric_key = ?1 AND paused_reason IS NULL`
        )
        .bind(rubricKey, now, bankSize)
        .run();
    },

    async claimStep(step, now, nextDueAt) {
      const result = await db
        .prepare(
          `UPDATE rubric_step_marks SET next_due_at = ?3, last_run_at = ?2
           WHERE step = ?1 AND next_due_at <= ?2`
        )
        .bind(step, now, nextDueAt)
        .run();
      return result.meta.changes === 1;
    },

    async stepDone(step, now, errorCode) {
      await db
        .prepare(
          `UPDATE rubric_step_marks
           SET last_success_at = CASE WHEN ?3 IS NULL THEN ?2 ELSE last_success_at END,
               last_error_code = ?3,
               fail_count = CASE WHEN ?3 IS NULL THEN 0 ELSE fail_count + 1 END
           WHERE step = ?1`
        )
        .bind(step, now, errorCode)
        .run();
    },

    async planDirty() {
      await db.prepare("UPDATE rubric_step_marks SET next_due_at = 0 WHERE step = 'plan'").run();
    },

    async stepHealth(step) {
      const row = await db
        .prepare('SELECT fail_count, last_error_code, last_success_at FROM rubric_step_marks WHERE step = ?1')
        .bind(step)
        .first<{ fail_count: number; last_error_code: string | null; last_success_at: number | null }>();
      return {
        failCount: row?.fail_count ?? 0,
        lastErrorCode: row?.last_error_code ?? null,
        lastSuccessAt: row?.last_success_at ?? null
      };
    },

    async lastPlanAt() {
      const row = await db
        .prepare("SELECT last_success_at FROM rubric_step_marks WHERE step = 'plan'")
        .first<{ last_success_at: number | null }>();
      return row?.last_success_at ?? null;
    }
  };
}
