import {
  automationIdSchema,
  automationRunSchema,
  automationSummarySchema,
  type AutomationId,
  type AutomationMutationDto,
  type AutomationRunDto,
  type AutomationRunsPageDto,
  type AutomationSummaryDto
} from '@alexeev/contracts';
import { AppError } from '../../shared/app-error';

const RUN_LEASE_MS = 5 * 60 * 1000;
const HISTORY_LIMIT = 100;

interface AutomationRow {
  id: string;
  enabled: number;
  revision: number;
  last_run_id: string | null;
  last_origin: 'scheduled' | 'manual' | null;
  last_status: 'queued' | 'running' | 'succeeded' | 'failed' | 'unknown' | 'skipped' | null;
  last_requested_at: number | null;
  last_scheduled_at: number | null;
  last_started_at: number | null;
  last_completed_at: number | null;
  last_lease_until: number | null;
  last_output_count: number | null;
  last_error_code: string | null;
  active_run_id: string | null;
  active_status: 'queued' | 'running' | null;
  retry_at: number | null;
  run_now_eligible: number;
}

interface RunRow {
  id: string;
  automation_id: string;
  origin: 'scheduled' | 'manual';
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'unknown' | 'skipped';
  requested_at: number;
  scheduled_at: number | null;
  started_at: number | null;
  completed_at: number | null;
  lease_until: number | null;
  output_count: number | null;
  error_code: string | null;
}

function iso(value: number | null): string | null {
  return value === null ? null : new Date(value).toISOString();
}

function toRunDto(row: RunRow): AutomationRunDto {
  return automationRunSchema.parse({
    id: row.id,
    automationId: row.automation_id,
    origin: row.origin,
    status: row.status,
    requestedAt: iso(row.requested_at),
    scheduledAt: iso(row.scheduled_at),
    startedAt: iso(row.started_at),
    completedAt: iso(row.completed_at),
    durationMs:
      row.started_at === null || row.completed_at === null ? null : Math.max(0, row.completed_at - row.started_at),
    outputCount: row.output_count,
    errorCode: row.error_code
  });
}

function fromCursor(cursor: string | undefined): { requestedAt: number; id: string } | null {
  if (cursor === undefined) return null;
  let decoded: string;
  try {
    decoded = atob(cursor);
  } catch {
    throw new AppError('VALIDATION_ERROR', 'Invalid cursor');
  }
  const separator = decoded.indexOf(':');
  const requestedAt = Number(decoded.slice(0, separator));
  const id = decoded.slice(separator + 1);
  if (separator < 1 || !Number.isSafeInteger(requestedAt) || requestedAt < 0 || !/^[0-9a-f-]{36}$/i.test(id)) {
    throw new AppError('VALIDATION_ERROR', 'Invalid cursor');
  }
  return { requestedAt, id };
}

function toCursor(row: RunRow): string {
  return btoa(`${row.requested_at}:${row.id}`);
}

const config = {
  'dota-intelligence': {
    cron: 'Every 5 minutes (UTC)',
    cadenceMinutes: 5,
    sideEffects: ['persist_dota_updates', 'create_review_draft', 'send_private_alert'] as const
  }
} satisfies Record<AutomationId, { cron: string; cadenceMinutes: number; sideEffects: readonly string[] }>;

/** The next 5-minute slot of the Dota feeds. */
function scheduleAt(now: number): number {
  return Math.ceil(now / (5 * 60_000)) * 5 * 60_000;
}

/**
 * Finished runs past the newest `?1` of each automation, oldest first, at most 100 a call. One window pass over the
 * table: the earlier correlated count recounted the table for every row and read ~11 500 rows a run on DEV,
 * half of the D1 free daily read limit (16.10.2026).
 */
export const AUTOMATION_HISTORY_PURGE_SQL = `DELETE FROM automation_runs WHERE id IN (
  SELECT id FROM (
    SELECT id, completed_at,
      ROW_NUMBER() OVER (PARTITION BY automation_id ORDER BY completed_at DESC, id DESC) AS newer_count
    FROM automation_runs WHERE completed_at IS NOT NULL
  )
  WHERE newer_count > ?1 AND completed_at <= ?2
  ORDER BY completed_at LIMIT 100
)`;

async function purgeAutomationHistory(db: D1Database, now: number, limit = HISTORY_LIMIT): Promise<number> {
  const result = await db.prepare(AUTOMATION_HISTORY_PURGE_SQL).bind(limit, now).run();
  return result.meta.changes;
}

export interface AutomationRepository {
  list(now: number): Promise<AutomationSummaryDto[]>;
  get(id: AutomationId, now: number): Promise<AutomationSummaryDto | null>;
  listRuns(input: { id: AutomationId; cursor?: string; limit: number }): Promise<AutomationRunsPageDto>;
  transition(input: {
    id: AutomationId;
    enabled: boolean;
    revision: number;
    actor: string;
    now: number;
  }): Promise<AutomationMutationDto>;
  enqueueScheduled(input: { id: AutomationId; slot: number; requestedAt: number; newId: () => string }): Promise<void>;
  /** `dueOnly` leaves a run whose slot is still ahead queued (a backoff retry); by default the slot is only a dedupe key. */
  claimNext(input: { id: AutomationId; now: number; dueOnly?: boolean }): Promise<AutomationRunDto | null>;
  finish(input: {
    runId: string;
    now: number;
    status: 'succeeded' | 'failed' | 'unknown' | 'skipped';
    outputCount: number;
    errorCode?: string;
  }): Promise<boolean>;
  markExpiredUnknown(now: number): Promise<number>;
  purgeHistory(now: number, limit?: number): Promise<number>;
  enqueueManual(input: { id: AutomationId; actor: string; now: number; newId: () => string }): Promise<{
    run: AutomationRunDto;
    coalesced: boolean;
  }>;
}

export function createD1AutomationRepository(db: D1Database): AutomationRepository {
  const readSummary = async (now: number): Promise<AutomationSummaryDto[]> => {
    const result = await db
      .prepare(
        `SELECT a.id, a.enabled, a.revision,
          r.id AS last_run_id, r.origin AS last_origin, r.status AS last_status,
          r.requested_at AS last_requested_at, r.scheduled_at AS last_scheduled_at,
          r.started_at AS last_started_at, r.completed_at AS last_completed_at,
          r.lease_until AS last_lease_until, r.output_count AS last_output_count, r.error_code AS last_error_code,
          active.id AS active_run_id, active.status AS active_status,
          (SELECT min(waiting.scheduled_at) FROM automation_runs waiting
            WHERE waiting.automation_id = a.id AND waiting.status = 'queued' AND waiting.scheduled_at > ?1) AS retry_at,
          CASE
            WHEN a.id = 'dota-intelligence' AND r.status IS NOT NULL AND r.status != 'skipped'
              AND coalesce(r.completed_at, r.started_at, r.requested_at) > ?1 - 300000 THEN 0
            ELSE 1
          END AS run_now_eligible
         FROM automations a
         LEFT JOIN automation_runs r ON r.id = (
           SELECT latest.id FROM automation_runs latest
           WHERE latest.automation_id = a.id
             AND NOT (latest.status = 'queued' AND latest.scheduled_at > ?1)
           ORDER BY latest.requested_at DESC, latest.id DESC LIMIT 1
         )
         LEFT JOIN automation_runs active ON active.id = (
           SELECT current.id FROM automation_runs current
           WHERE current.automation_id = a.id AND current.status IN ('queued', 'running')
             AND NOT (current.status = 'queued' AND current.scheduled_at > ?1)
           ORDER BY current.requested_at, current.id LIMIT 1
         )
         -- Rows of removed automations (dota-hero-statistics, 14.10.2026) stay in D1 but are not listed.
         WHERE a.id IN ('dota-intelligence')
         ORDER BY a.id`
      )
      .bind(now)
      .all<AutomationRow>();
    return result.results.map((row) => {
      const id = automationIdSchema.parse(row.id);
      const lastRun =
        row.last_run_id === null
          ? null
          : toRunDto({
              id: row.last_run_id,
              automation_id: id,
              origin: row.last_origin as 'scheduled' | 'manual',
              status: row.last_status as RunRow['status'],
              requested_at: row.last_requested_at as number,
              scheduled_at: row.last_scheduled_at,
              started_at: row.last_started_at,
              completed_at: row.last_completed_at,
              lease_until: row.last_lease_until,
              output_count: row.last_output_count,
              error_code: row.last_error_code
            });
      const configEntry = config[id];
      const latestSuccess = row.last_status === 'succeeded' ? row.last_completed_at : null;
      const health =
        row.last_status === 'failed'
          ? 'degraded'
          : row.last_status === 'unknown'
            ? 'unverified'
            : latestSuccess === null
              ? 'unverified'
              : now - latestSuccess > configEntry.cadenceMinutes * 60_000 * 2
                ? 'stale'
                : 'healthy';
      return automationSummarySchema.parse({
        id,
        enabled: row.enabled === 1,
        revision: row.revision,
        cron: configEntry.cron,
        cadenceMinutes: configEntry.cadenceMinutes,
        // A backoff retry waiting for its slot is neither the last run nor an active one; it is the next run.
        nextRunAt: row.enabled === 1 ? iso(Math.min(scheduleAt(now), row.retry_at ?? Number.POSITIVE_INFINITY)) : null,
        health,
        executionState: row.active_status ?? 'idle',
        activeRunId: row.active_run_id,
        lastRun,
        runNowAllowed: row.enabled === 1 && row.active_run_id === null && row.run_now_eligible === 1,
        sideEffects: [...configEntry.sideEffects]
      });
    });
  };

  return {
    async list(now) {
      return readSummary(now);
    },

    async get(id, now) {
      return (await readSummary(now)).find((item) => item.id === id) ?? null;
    },

    async listRuns({ id, cursor, limit }) {
      const position = fromCursor(cursor);
      const statement =
        position === null
          ? db
              .prepare(
                `SELECT id, automation_id, origin, status, requested_at, scheduled_at, started_at, completed_at,
              lease_until, output_count, error_code FROM automation_runs
             WHERE automation_id = ?1 ORDER BY requested_at DESC, id DESC LIMIT ?2`
              )
              .bind(id, limit + 1)
          : db
              .prepare(
                `SELECT id, automation_id, origin, status, requested_at, scheduled_at, started_at, completed_at,
              lease_until, output_count, error_code FROM automation_runs
             WHERE automation_id = ?1 AND (requested_at < ?2 OR (requested_at = ?2 AND id < ?3))
             ORDER BY requested_at DESC, id DESC LIMIT ?4`
              )
              .bind(id, position.requestedAt, position.id, limit + 1);
      const result = await statement.all<RunRow>();
      const rows = result.results.slice(0, limit);
      const lastRow = rows.at(-1);
      return {
        items: rows.map(toRunDto),
        nextCursor: result.results.length > limit && lastRow !== undefined ? toCursor(lastRow) : null
      };
    },

    async transition({ id, enabled, revision, actor, now }) {
      const current = await db.prepare('SELECT enabled, revision FROM automations WHERE id = ?1').bind(id).first<{
        enabled: number;
        revision: number;
      }>();
      if (current === null) throw new AppError('NOT_FOUND', 'Automation not found');
      if (current.revision !== revision)
        throw new AppError('CONFLICT', 'Automation changed', { reason: 'STALE_REVISION' });
      if ((current.enabled === 1) === enabled) {
        const automation = await this.get(id, now);
        if (automation === null) throw new AppError('NOT_FOUND', 'Automation not found');
        return { automation, changed: false };
      }
      const auditAction = enabled ? 'automation.resume' : 'automation.pause';
      const results = await db.batch([
        db
          .prepare(
            'UPDATE automations SET enabled = ?1, revision = revision + 1, updated_at = ?2 WHERE id = ?3 AND revision = ?4'
          )
          .bind(enabled ? 1 : 0, now, id, revision),
        ...(!enabled
          ? [
              db
                .prepare(
                  `UPDATE automation_runs SET status = 'skipped', completed_at = ?1, error_code = 'PAUSED_BEFORE_START'
           WHERE automation_id = ?2 AND status = 'queued'
             AND EXISTS (SELECT 1 FROM automations WHERE id = ?2 AND enabled = 0 AND revision = ?3)`
                )
                .bind(now, id, revision + 1)
            ]
          : []),
        db
          .prepare(
            `INSERT OR IGNORE INTO audit_log (actor_telegram_id, action, entity_type, entity_id, created_at, details)
           SELECT ?1, ?2, 'automation', ?3, ?4, json_object('revision', ?5)
           WHERE EXISTS (SELECT 1 FROM automations WHERE id = ?3 AND revision = ?5)`
          )
          .bind(actor, auditAction, id, now, revision + 1)
      ]);
      if (results[0]?.meta.changes !== 1)
        throw new AppError('CONFLICT', 'Automation changed', { reason: 'STALE_REVISION' });
      const automation = await this.get(id, now);
      if (automation === null) throw new AppError('NOT_FOUND', 'Automation not found');
      return { automation, changed: true };
    },

    async enqueueScheduled({ id, slot, requestedAt, newId }) {
      await db
        .prepare(
          `INSERT OR IGNORE INTO automation_runs (id, automation_id, origin, status, requested_at, scheduled_at)
         SELECT ?1, id, 'scheduled', 'queued', ?2, ?3 FROM automations
         WHERE id = ?4 AND enabled = 1
           AND NOT EXISTS (SELECT 1 FROM automation_runs WHERE automation_id = ?4 AND status IN ('queued', 'running'))`
        )
        .bind(newId(), requestedAt, slot, id)
        .run();
    },

    async claimNext({ id, now, dueOnly = false }) {
      const candidate = await db
        .prepare(
          `SELECT id, automation_id, origin, status, requested_at, scheduled_at, started_at, completed_at,
          lease_until, output_count, error_code FROM automation_runs
         WHERE automation_id = ?1 AND status = 'queued' AND (?2 IS NULL OR scheduled_at IS NULL OR scheduled_at <= ?2)
         ORDER BY requested_at, id LIMIT 1`
        )
        .bind(id, dueOnly ? now : null)
        .first<RunRow>();
      if (candidate === null) return null;
      const claim = await db
        .prepare(
          `UPDATE automation_runs SET status = 'running', started_at = ?1, lease_until = ?2
         WHERE id = ?3 AND status = 'queued'
           AND EXISTS (SELECT 1 FROM automations WHERE id = ?4 AND enabled = 1)`
        )
        .bind(now, now + RUN_LEASE_MS, candidate.id, id)
        .run();
      if (claim.meta.changes !== 1) return null;
      return toRunDto({ ...candidate, status: 'running', started_at: now, lease_until: now + RUN_LEASE_MS });
    },

    async finish({ runId, now, status, outputCount, errorCode }) {
      const result = await db
        .prepare(
          `UPDATE automation_runs SET status = ?1, completed_at = ?2, lease_until = NULL,
          output_count = ?3, error_code = ?4
         WHERE id = ?5 AND status = 'running' AND lease_until > ?2`
        )
        .bind(status, now, outputCount, errorCode ?? null, runId)
        .run();
      if (result.meta.changes !== 1) return false;
      await purgeAutomationHistory(db, now);
      return true;
    },

    async markExpiredUnknown(now) {
      const result = await db
        .prepare(
          `UPDATE automation_runs SET status = 'unknown', completed_at = ?1, lease_until = NULL,
          error_code = 'AUTOMATION_LEASE_EXPIRED'
         WHERE id IN (SELECT id FROM automation_runs WHERE status = 'running' AND lease_until <= ?1 ORDER BY lease_until LIMIT 20)`
        )
        .bind(now)
        .run();
      return result.meta.changes;
    },

    async enqueueManual({ id, actor, now, newId }) {
      const current = await this.get(id, now);
      if (current === null) throw new AppError('NOT_FOUND', 'Automation not found');
      if (!current.enabled) throw new AppError('CONFLICT', 'Automation is paused', { reason: 'AUTOMATION_PAUSED' });
      const existing = await db
        .prepare(
          `SELECT id, automation_id, origin, status, requested_at, scheduled_at, started_at, completed_at,
          lease_until, output_count, error_code FROM automation_runs
         WHERE automation_id = ?1 AND status IN ('queued', 'running') ORDER BY requested_at, id LIMIT 1`
        )
        .bind(id)
        .first<RunRow>();
      if (existing !== null) {
        // A retry waiting for its backoff is pulled forward: «Обновить сейчас» must not wait for it.
        if (existing.status === 'queued' && existing.scheduled_at !== null && existing.scheduled_at > now) {
          await db
            .prepare(`UPDATE automation_runs SET scheduled_at = ?1 WHERE id = ?2 AND status = 'queued'`)
            .bind(now, existing.id)
            .run();
          return { run: toRunDto({ ...existing, scheduled_at: now }), coalesced: true };
        }
        return { run: toRunDto(existing), coalesced: true };
      }
      if (!current.runNowAllowed)
        throw new AppError('CONFLICT', 'Automation is not due yet', { reason: 'RUN_NOT_DUE' });
      const runId = newId();
      const inserted = await db.batch([
        db
          .prepare(
            `INSERT OR IGNORE INTO automation_runs (id, automation_id, origin, status, requested_at)
           SELECT ?1, id, 'manual', 'queued', ?2 FROM automations
           WHERE id = ?3 AND enabled = 1
             AND NOT EXISTS (SELECT 1 FROM automation_runs WHERE automation_id = ?3 AND status IN ('queued', 'running'))`
          )
          .bind(runId, now, id),
        db
          .prepare(
            `INSERT INTO audit_log (actor_telegram_id, action, entity_type, entity_id, created_at, details)
           SELECT ?1, 'automation.run_now', 'automation', ?2, ?3, json_object('runId', ?4)
           WHERE EXISTS (SELECT 1 FROM automation_runs WHERE id = ?4 AND status = 'queued')`
          )
          .bind(actor, id, now, runId)
      ]);
      if (inserted[0]?.meta.changes === 1) {
        return {
          run: automationRunSchema.parse({
            id: runId,
            automationId: id,
            origin: 'manual',
            status: 'queued',
            requestedAt: iso(now),
            scheduledAt: null,
            startedAt: null,
            completedAt: null,
            durationMs: null,
            outputCount: null,
            errorCode: null
          }),
          coalesced: false
        };
      }
      const raced = await db
        .prepare(
          `SELECT id, automation_id, origin, status, requested_at, scheduled_at, started_at, completed_at,
          lease_until, output_count, error_code FROM automation_runs
         WHERE automation_id = ?1 AND status IN ('queued', 'running') ORDER BY requested_at, id LIMIT 1`
        )
        .bind(id)
        .first<RunRow>();
      if (raced !== null) return { run: toRunDto(raced), coalesced: true };
      const afterRace = await this.get(id, now);
      if (afterRace === null || !afterRace.enabled) {
        throw new AppError('CONFLICT', 'Automation is paused', { reason: 'AUTOMATION_PAUSED' });
      }
      throw new AppError('CONFLICT', 'Automation run could not be queued', { reason: 'RUN_CLAIM_CONFLICT' });
    },

    async purgeHistory(now, limit = HISTORY_LIMIT) {
      return purgeAutomationHistory(db, now, limit);
    }
  };
}
