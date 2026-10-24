import { beforeEach, describe, expect, it } from 'vitest';
import { testDb } from './helpers/db';
import { purgeOperationalRows } from '../src/platform/housekeeping/d1-purge';

const DAY = 24 * 60 * 60 * 1000;
const NOW = 2_000_000_000_000;
const LIMIT = 100;
const db = testDb();
const uuid = (name: string): string => `00000000-0000-4000-8000-${name.padStart(12, '0')}`;

async function addJob(id: string, status: string, updatedAt: number): Promise<void> {
  await db
    .prepare(
      `INSERT INTO jobs (id, kind, publication_id, status, run_at, lease_until, send_started_at,
         attempts, dedupe_key, publication_scheduled_at, created_at, updated_at)
       VALUES (?1, 'publish', NULL, ?2, ?3, NULL, NULL, 1, ?4, NULL, ?3, ?3)`
    )
    .bind(id, status, updatedAt, `retention:${id}`)
    .run();
}

async function addAttempt(jobId: string, finishedAt: number): Promise<void> {
  await db
    .prepare(
      `INSERT INTO job_attempts (job_id, attempt, started_at, finished_at, outcome)
       VALUES (?1, 1, ?2, ?3, 'sent')`
    )
    .bind(jobId, finishedAt - 1, finishedAt)
    .run();
}

async function addAudit(id: string, createdAt: number): Promise<void> {
  await db
    .prepare(
      `INSERT INTO audit_log (actor_telegram_id, action, entity_type, entity_id, created_at)
       VALUES ('1', 'test', 'retention', ?1, ?2)`
    )
    .bind(id, createdAt)
    .run();
}

async function addIncident(id: string, jobId: string, createdAt: number, resolvedAt: number | null): Promise<void> {
  await db
    .prepare(
      `INSERT INTO incidents (id, kind, job_id, code, created_at, resolved_at)
       VALUES (?1, 'publish_failed', ?2, 'TEST', ?3, ?4)`
    )
    .bind(id, jobId, createdAt, resolvedAt)
    .run();
}

async function counts(): Promise<{ attempts: number; incidents: number; audits: number }> {
  const [attempts, incidents, audits] = await Promise.all([
    db.prepare('SELECT count(*) AS n FROM job_attempts').first<{ n: number }>(),
    db.prepare('SELECT count(*) AS n FROM incidents').first<{ n: number }>(),
    db.prepare('SELECT count(*) AS n FROM audit_log').first<{ n: number }>()
  ]);
  return { attempts: attempts?.n ?? 0, incidents: incidents?.n ?? 0, audits: audits?.n ?? 0 };
}

describe('operational retention against migrated D1', () => {
  beforeEach(async () => {
    await db.batch([
      db.prepare('DELETE FROM job_attempts'),
      db.prepare('DELETE FROM incidents'),
      db.prepare('DELETE FROM jobs'),
      db.prepare('DELETE FROM audit_log')
    ]);
  });

  it('applies indexes from the zero-schema migration set and plans bounded scans through indexes', async () => {
    const indexes = await db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type = 'index' AND name IN
        ('job_attempts_finished_idx', 'incidents_resolved_idx', 'audit_log_created_idx')`
      )
      .all<{ name: string }>();
    expect(indexes.results.map(({ name }) => name).sort()).toEqual([
      'audit_log_created_idx',
      'incidents_resolved_idx',
      'job_attempts_finished_idx'
    ]);

    const plans = await Promise.all([
      db
        .prepare(
          `EXPLAIN QUERY PLAN SELECT a.rowid
          FROM job_attempts AS a INDEXED BY job_attempts_finished_idx
          JOIN jobs AS j ON j.id = a.job_id
          WHERE a.finished_at <= ?
            AND j.status IN ('succeeded', 'failed', 'cancelled')
            AND NOT EXISTS (
              SELECT 1 FROM incidents AS i INDEXED BY incidents_job_idx
              WHERE i.job_id = j.id AND i.resolved_at IS NULL
            )
          ORDER BY a.finished_at, a.job_id, a.attempt LIMIT ?`
        )
        .bind(NOW, LIMIT)
        .all<{ detail: string }>(),
      db
        .prepare(
          `EXPLAIN QUERY PLAN SELECT id FROM incidents INDEXED BY incidents_resolved_idx
          WHERE resolved_at <= ? ORDER BY resolved_at, id LIMIT ?`
        )
        .bind(NOW, LIMIT)
        .all<{ detail: string }>(),
      db
        .prepare(
          `EXPLAIN QUERY PLAN SELECT rowid FROM audit_log INDEXED BY audit_log_created_idx
          WHERE created_at <= ? ORDER BY created_at, id LIMIT ?`
        )
        .bind(NOW, LIMIT)
        .all<{ detail: string }>()
    ]);
    const details = plans.flatMap(({ results }) => results.map(({ detail }) => detail)).join(' ');
    expect(details).toContain('USING COVERING INDEX job_attempts_finished_idx');
    expect(details).toContain('USING INDEX incidents_job_idx');
    expect(details).toContain('USING COVERING INDEX incidents_resolved_idx');
    expect(details).toContain('USING COVERING INDEX audit_log_created_idx');
  });

  it('purges only aged eligible rows, preserves active jobs and open incidents, and is bounded and repeat-safe', async () => {
    const attemptCutoff = NOW - 90 * DAY;
    const historyCutoff = NOW - 365 * DAY;
    await addJob(uuid('1'), 'succeeded', attemptCutoff - 1);
    await addJob(uuid('2'), 'failed', attemptCutoff);
    await addJob(uuid('3'), 'pending', attemptCutoff - 100);
    await addJob(uuid('4'), 'failed', attemptCutoff - 100);
    await addJob(uuid('5'), 'failed', attemptCutoff - 100);
    await addAttempt(uuid('1'), attemptCutoff - 1);
    await addAttempt(uuid('2'), attemptCutoff);
    await addAttempt(uuid('3'), attemptCutoff - 1);
    await addAttempt(uuid('4'), attemptCutoff - 1);
    await addAttempt(uuid('5'), attemptCutoff - 1);
    await addIncident(uuid('11'), uuid('4'), historyCutoff - 1, null);
    await addIncident(uuid('12'), uuid('5'), historyCutoff - 10, historyCutoff - 1);
    await addIncident(uuid('13'), uuid('5'), historyCutoff - 10, historyCutoff);
    await addIncident(uuid('14'), uuid('5'), historyCutoff - 10, historyCutoff + 1);
    await addAudit('old', historyCutoff - 1);
    await addAudit('boundary', historyCutoff);
    await addAudit('young', historyCutoff + 1);

    const result = await purgeOperationalRows(db, { now: NOW, limit: 1 });
    expect(result).toEqual({ jobAttempts: 1, resolvedIncidents: 1, auditRows: 1 });
    const incidentIds = await db.prepare('SELECT id FROM incidents ORDER BY id').all<{ id: string }>();
    expect(incidentIds.results.map(({ id }) => id)).toEqual([uuid('11'), uuid('13'), uuid('14')]);
    expect(await counts()).toEqual({ attempts: 4, incidents: 3, audits: 2 });

    const next = await purgeOperationalRows(db, { now: NOW, limit: LIMIT });
    expect(next).toEqual({ jobAttempts: 1, resolvedIncidents: 0, auditRows: 0 });
    const repeat = await purgeOperationalRows(db, { now: NOW, limit: LIMIT });
    expect(repeat).toEqual({ jobAttempts: 0, resolvedIncidents: 0, auditRows: 0 });
    expect(await counts()).toEqual({ attempts: 3, incidents: 3, audits: 2 });

    const remaining = await db
      .prepare(`SELECT j.id FROM job_attempts a JOIN jobs j ON j.id = a.job_id ORDER BY j.id`)
      .all<{ id: string }>();
    expect(remaining.results.map(({ id }) => id)).toEqual([uuid('2'), uuid('3'), uuid('4')]);
  });

  it('overlapping cleanup calls cannot delete more than the eligible rows or fail on replay', async () => {
    await addJob(uuid('21'), 'cancelled', NOW - 100 * DAY);
    await addJob(uuid('22'), 'succeeded', NOW - 100 * DAY);
    await addAttempt(uuid('21'), NOW - 100 * DAY);
    await addAttempt(uuid('22'), NOW - 100 * DAY);
    await addAudit('overlap-a', NOW - 400 * DAY);
    await addAudit('overlap-b', NOW - 400 * DAY);

    const results = await Promise.all([
      purgeOperationalRows(db, { now: NOW, limit: 1 }),
      purgeOperationalRows(db, { now: NOW, limit: 1 })
    ]);
    expect(results.reduce((sum, result) => sum + result.jobAttempts, 0)).toBe(2);
    expect(results.reduce((sum, result) => sum + result.auditRows, 0)).toBe(2);
    expect(await counts()).toEqual({ attempts: 0, incidents: 0, audits: 0 });
  });
});
