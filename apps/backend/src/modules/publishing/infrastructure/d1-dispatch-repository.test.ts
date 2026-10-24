import { beforeEach, describe, expect, it } from 'vitest';
import { testDb } from '../../../../tests/helpers/db';
import { resetDb, START } from '../../../../tests/helpers/harness';
import {
  DUE_JOBS_SQL,
  EXPIRED_CLAIMS_SQL,
  OWNER_INCIDENT_ALERT_GROUPS_SQL,
  PURGE_OWNER_INCIDENT_ALERT_GROUPS_SQL
} from './d1-dispatch-repository';
import { createD1DispatchRepository } from './d1-dispatch-repository';

beforeEach(resetDb);

async function plan(sql: string, ...bindings: (string | number)[]): Promise<string> {
  const { results } = await testDb()
    .prepare(`EXPLAIN QUERY PLAN ${sql}`)
    .bind(...bindings)
    .all<{ detail: string }>();
  return results.map((row) => row.detail).join('\n');
}

async function run(sql: string, ...bindings: (string | number)[]): Promise<D1Result<{ id: string }>> {
  return testDb()
    .prepare(sql)
    .bind(...bindings)
    .all<{ id: string }>();
}

async function seedJobs(rows: { id: number; kind?: string; status: string; runAt: number }[]): Promise<void> {
  const db = testDb();
  await db.batch(
    rows.map((row) =>
      db
        .prepare(
          `INSERT INTO jobs (id, kind, status, run_at, attempts, dedupe_key, created_at, updated_at)
           VALUES (printf('%036d', ?1), ?2, ?3, ?4, 0, 'job:' || ?1, ?4, ?4)`
        )
        .bind(row.id, row.kind ?? 'publish', row.status, row.runAt)
    )
  );
}

describe('due scan', () => {
  it('searches the partial due index once per status, without a table scan', async () => {
    const detail = await plan(DUE_JOBS_SQL, START, 3);

    expect(detail.match(/SEARCH jobs USING (COVERING )?INDEX jobs_due \(status=\? AND run_at<\?\)/g)).toHaveLength(2);
    expect(detail).not.toMatch(/SCAN jobs/);
    expect(detail).not.toContain('jobs_status_scheduled_idx');
  });

  it('returns the oldest due publish jobs of both statuses, and nothing else', async () => {
    await seedJobs([
      { id: 1, status: 'pending', runAt: START - 50 },
      { id: 2, status: 'retry_wait', runAt: START - 100 },
      { id: 3, status: 'pending', runAt: START - 10 },
      { id: 4, status: 'retry_wait', runAt: START - 20 },
      { id: 5, status: 'pending', runAt: START + 1 },
      { id: 6, status: 'claimed', runAt: START - 500 },
      { id: 7, status: 'unknown', runAt: START - 500 },
      { id: 8, status: 'pending', runAt: START - 500, kind: 'other' }
    ]);

    const { results } = await run(DUE_JOBS_SQL, START, 3);

    expect(results.map((row) => Number(row.id))).toEqual([2, 1, 4]);
  });

  it('reads a bounded number of rows however large the backlog of due jobs is', async () => {
    await testDb()
      .prepare(
        `WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i <= 2000)
         INSERT INTO jobs (id, kind, status, run_at, attempts, dedupe_key, created_at, updated_at)
         SELECT printf('%036d', i), 'publish', CASE WHEN i % 2 = 0 THEN 'pending' ELSE 'retry_wait' END,
                ?1 - i, 0, 'job:' || i, ?1, ?1 FROM n`
      )
      .bind(START)
      .run();

    const page = await run(DUE_JOBS_SQL, START, 3);

    expect(page.results).toHaveLength(3);
    expect(page.meta.rows_read).toBeLessThanOrEqual(2 * 3 + 6);
  });
});

describe('reconcile scan', () => {
  it('searches the claimed-lease index', async () => {
    expect(await plan(EXPIRED_CLAIMS_SQL, START, 2)).toContain(
      'SEARCH jobs USING INDEX jobs_claimed_lease (status=? AND lease_until<?)'
    );
  });

  it('returns only claimed jobs whose lease ran out, earliest lease first', async () => {
    const db = testDb();
    await seedJobs([
      { id: 1, status: 'claimed', runAt: START },
      { id: 2, status: 'claimed', runAt: START },
      { id: 3, status: 'claimed', runAt: START },
      { id: 4, status: 'pending', runAt: START }
    ]);
    await db.batch([
      db.prepare("UPDATE jobs SET lease_until = ?1 WHERE id = printf('%036d', 1)").bind(START - 10),
      db.prepare("UPDATE jobs SET lease_until = ?1 WHERE id = printf('%036d', 2)").bind(START - 20),
      db.prepare("UPDATE jobs SET lease_until = ?1 WHERE id = printf('%036d', 3)").bind(START + 20)
    ]);

    const { results } = await run(EXPIRED_CLAIMS_SQL, START, 5);

    expect(results.map((row) => Number(row.id))).toEqual([2, 1]);
  });
});

describe('queries of the new tables and cleanup', () => {
  it('uses the due-group index and bounds the owner alert scan', async () => {
    const detail = await plan(OWNER_INCIDENT_ALERT_GROUPS_SQL, START, 8);

    expect(detail).toContain('incident_alert_groups_due_idx');
    expect(detail).toContain('incidents_alert_group_open_idx');
    expect(detail).not.toContain('SCAN incident_alert_groups');
  });

  it('purges only a bounded page of one-shot recovered groups through their partial index', async () => {
    const detail = await plan(PURGE_OWNER_INCIDENT_ALERT_GROUPS_SQL, 25);

    expect(detail).toContain('incident_alert_groups_recovery_idx');
    expect(detail).not.toContain('SCAN incident_alert_groups');
  });

  it('deletes only already-claimed recovery groups and leaves open groups available for deduplication', async () => {
    const db = testDb();
    await db.batch(
      [
        ['publish_failed:recovered', START],
        ['publish_failed:open', null]
      ].map(([groupKey, recoveryClaim]) =>
        db
          .prepare(
            `INSERT INTO incident_alert_groups
             (group_key, kind, affected_id, first_seen_at, last_seen_at, occurrence_count,
              last_alert_claimed_at, alert_succeeded_at, recovery_claimed_at)
             VALUES (?1, 'publish_failed', '00000000-0000-0000-0000-000000000001', ?2, ?2, 1, ?2, ?2, ?3)`
          )
          .bind(groupKey, START, recoveryClaim)
      )
    );

    const purged = await createD1DispatchRepository(db).purgeOwnerIncidentAlertGroups(1);
    const rows = await db
      .prepare('SELECT group_key FROM incident_alert_groups ORDER BY group_key')
      .all<{ group_key: string }>();

    expect(purged).toBe(1);
    expect(rows.results.map((row) => row.group_key)).toEqual(['publish_failed:open']);
  });

  it('lists open incidents newest first from the partial index, without sorting', async () => {
    const detail = await plan(
      'SELECT id FROM incidents WHERE resolved_at IS NULL ORDER BY created_at DESC, id DESC LIMIT ?1',
      20
    );

    expect(detail).toContain('incidents_open_idx');
    expect(detail).not.toContain('TEMP B-TREE');
  });

  it.each([
    [
      'idempotency keys',
      'SELECT rowid FROM idempotency_keys WHERE expires_at <= ?1 ORDER BY expires_at LIMIT ?2',
      'idempotency_keys_expires_idx'
    ],
    [
      'rate-limit windows',
      'SELECT bucket FROM rate_limits WHERE window_start < ?1 ORDER BY window_start LIMIT ?2',
      'rate_limits_window_idx'
    ],
    [
      'widget sign-ins',
      'SELECT hash_sha256 FROM widget_sign_ins WHERE expires_at <= ?1 ORDER BY expires_at LIMIT ?2',
      'widget_sign_ins_expiry_idx'
    ]
  ])('purges expired %s from their expiry index', async (_name, sql, index) => {
    const detail = await plan(sql, START, 100);

    expect(detail).toContain(index);
    expect(detail).not.toContain('TEMP B-TREE');
  });
});

describe('attempt and incident rows', () => {
  const JOB = '00000000-0000-4000-8000-000000000001';

  beforeEach(() => seedJobs([{ id: 1, status: 'claimed', runAt: START }]));

  const insertAttempt = (attempt: number) =>
    testDb()
      .prepare(
        `INSERT INTO job_attempts (job_id, attempt, started_at, finished_at, outcome) VALUES (printf('%036d', 1), ?1, ?2, ?2, 'sent')`
      )
      .bind(attempt, START)
      .run();

  it('an attempt of a job is recorded once: a replayed write fails instead of duplicating', async () => {
    await insertAttempt(1);

    await expect(insertAttempt(1)).rejects.toThrow(/UNIQUE|PRIMARY/);
    await insertAttempt(2);
    expect(JOB.length).toBe(36);
  });

  it('refuses an unknown outcome and an attempt of a job that does not exist', async () => {
    const db = testDb();
    await expect(
      db
        .prepare(
          `INSERT INTO job_attempts (job_id, attempt, started_at, finished_at, outcome) VALUES (printf('%036d', 1), 1, ?1, ?1, 'whatever')`
        )
        .bind(START)
        .run()
    ).rejects.toThrow(/CHECK/);
    await expect(
      db
        .prepare(
          `INSERT INTO job_attempts (job_id, attempt, started_at, finished_at, outcome) VALUES ('missing', 1, ?1, ?1, 'sent')`
        )
        .bind(START)
        .run()
    ).rejects.toThrow(/FOREIGN KEY/);
  });

  it('bounds incident details to valid JSON of at most 1 KB', async () => {
    const insert = (details: string) =>
      testDb()
        .prepare(
          `INSERT INTO incidents (id, kind, job_id, code, created_at, details) VALUES (?1, 'publish_failed', printf('%036d', 1), 'X', ?2, ?3)`
        )
        .bind(crypto.randomUUID(), START, details)
        .run();

    await insert('{"attempt":1}');
    await expect(insert('not json')).rejects.toThrow(/CHECK/);
    await expect(insert(JSON.stringify({ text: 'x'.repeat(1100) }))).rejects.toThrow(/CHECK/);
  });
});
