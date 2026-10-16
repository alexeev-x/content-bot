import {
  apiErrorSchema,
  automationListSchema,
  automationMutationSchema,
  automationRunsPageSchema,
  automationSummarySchema,
  runAutomationNowResponseSchema
} from '@alexeev/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { AUTOMATION_HISTORY_PURGE_SQL, createD1AutomationRepository } from '../../src/modules/automations';
import { seedDueJob } from '../helpers/dispatch';
import { testDb } from '../helpers/db';
import { createApi, fakeClock, OWNER_TOKEN, resetDb, seedSession, START } from '../helpers/harness';

beforeEach(async () => {
  await resetDb();
  await seedSession({ token: OWNER_TOKEN, expiresAt: START + 86_400_000 });
});

describe('automation history retention', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('keeps the newest 100 finished runs, deletes the oldest and never a running one', async () => {
    const db = testDb();
    const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
    const finished = Array.from({ length: 130 }, (_, n) =>
      db
        .prepare(
          `INSERT INTO automation_runs (id, automation_id, origin, status, requested_at, started_at, completed_at)
           VALUES (?, 'dota-intelligence', 'manual', 'succeeded', ?, ?, ?)`
        )
        .bind(id(n), START + n, START + n, START + n)
    );
    const running = db
      .prepare(
        `INSERT INTO automation_runs (id, automation_id, origin, status, requested_at, started_at, lease_until)
         VALUES (?, 'dota-intelligence', 'manual', 'running', ?, ?, ?)`
      )
      .bind(id(999), START, START, START + 60_000);
    await db.batch([...finished, running]);

    const repo = createD1AutomationRepository(db);
    expect(await repo.purgeHistory(START + 1_000)).toBe(30);
    const left = await db
      .prepare('SELECT id, status FROM automation_runs ORDER BY requested_at, id')
      .all<{ id: string; status: string }>();
    // The 30 oldest finished runs are gone; the 100 newest and the running one stay.
    expect(left.results.filter((row) => row.status === 'succeeded').map((row) => row.id)).toEqual(
      Array.from({ length: 100 }, (_, n) => id(n + 30))
    );
    expect(left.results.some((row) => row.id === id(999))).toBe(true);
    expect(await repo.purgeHistory(START + 1_000)).toBe(0);

    // One pass over the table, not a recount of it per row (that read ~11 500 rows a run on DEV, 16.10.2026).
    const plan = await db
      .prepare(`EXPLAIN QUERY PLAN ${AUTOMATION_HISTORY_PURGE_SQL}`)
      .bind(100, START)
      .all<{ detail: string }>();
    expect(plan.results.map((row) => row.detail).join(' | ')).not.toMatch(/CORRELATED/);
  });
});

describe('Automation Center API', () => {
  it('is owner-only and returns only the registered bounded automations', async () => {
    const api = createApi({ clock: fakeClock(START) });
    expect((await api.request('/api/v1/automations', { token: null })).status).toBe(401);
    await seedSession({ token: 'foreign-automation-token', telegramId: '999', expiresAt: START + 86_400_000 });
    expect((await api.request('/api/v1/automations', { token: 'foreign-automation-token' })).status).toBe(403);
    expect((await api.request('/api/v1/automations/dota-intelligence')).status).toBe(200);
    const list = automationListSchema.parse(await (await api.request('/api/v1/automations')).json());
    expect(list.items.map((item) => item.id)).toEqual(['dota-intelligence']);
    expect(list.items.every((item) => item.enabled && item.runNowAllowed)).toBe(true);
    expect(
      automationSummarySchema.parse(await (await api.request('/api/v1/automations/dota-intelligence')).json())
        .sideEffects
    ).toContain('persist_dota_updates');
    expect((await api.request('/api/v1/automations/publication-dispatch')).status).toBe(404);
  });

  it('claims scheduled runs at request time while retaining their schedule slot', async () => {
    const repo = createD1AutomationRepository(testDb());
    const scheduledAt = START + 5 * 60_000;
    await repo.enqueueScheduled({
      id: 'dota-intelligence',
      slot: scheduledAt,
      requestedAt: START,
      newId: () => crypto.randomUUID()
    });

    const run = await repo.claimNext({ id: 'dota-intelligence', now: START });

    expect(run).toMatchObject({
      origin: 'scheduled',
      requestedAt: new Date(START).toISOString(),
      scheduledAt: new Date(scheduledAt).toISOString(),
      startedAt: new Date(START).toISOString()
    });
  });

  it('keeps a backoff retry queued until its slot when claimed with dueOnly', async () => {
    const repo = createD1AutomationRepository(testDb());
    const retryAt = START + 5 * 60_000;
    await repo.enqueueScheduled({
      id: 'dota-intelligence',
      slot: retryAt,
      requestedAt: START,
      newId: () => crypto.randomUUID()
    });

    expect(await repo.claimNext({ id: 'dota-intelligence', now: retryAt - 1, dueOnly: true })).toBeNull();
    expect(await repo.claimNext({ id: 'dota-intelligence', now: retryAt, dueOnly: true })).toMatchObject({
      scheduledAt: new Date(retryAt).toISOString()
    });
  });

  it('pauses only future runs, skips queued work, checks revision, and replays the accepted command', async () => {
    const api = createApi({ clock: fakeClock(START) });
    const publication = await seedDueJob(api);
    const queued = await api.request('/api/v1/automations/dota-intelligence/run-now', {
      method: 'POST',
      headers: { 'idempotency-key': 'run-before-pause' },
      json: {}
    });
    expect(queued.status).toBe(202);

    const pause = await api.request('/api/v1/automations/dota-intelligence/pause', {
      method: 'POST',
      headers: { 'idempotency-key': 'pause-1' },
      json: { revision: 0 }
    });
    expect(pause.status).toBe(200);
    const paused = automationMutationSchema.parse(await pause.json());
    expect(paused).toMatchObject({ changed: true, automation: { enabled: false, revision: 1, activeRunId: null } });

    const replay = await api.request('/api/v1/automations/dota-intelligence/pause', {
      method: 'POST',
      headers: { 'idempotency-key': 'pause-1' },
      json: { revision: 0 }
    });
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual(paused);

    const stale = await api.request('/api/v1/automations/dota-intelligence/resume', {
      method: 'POST',
      headers: { 'idempotency-key': 'resume-stale' },
      json: { revision: 0 }
    });
    expect(stale.status).toBe(409);
    expect(apiErrorSchema.parse(await stale.json()).error.details).toMatchObject({ reason: 'STALE_REVISION' });
    const refused = await api.request('/api/v1/automations/dota-intelligence/run-now', {
      method: 'POST',
      headers: { 'idempotency-key': 'run-paused' },
      json: {}
    });
    expect(refused.status).toBe(409);
    const rows = await testDb()
      .prepare("SELECT status FROM automation_runs WHERE origin = 'manual'")
      .all<{ status: string }>();
    expect(rows.results.map((row) => row.status)).toEqual(['skipped']);
    expect(
      await testDb()
        .prepare('SELECT status FROM jobs WHERE id = ?1')
        .bind(publication.jobId)
        .first<{ status: string }>()
    ).toMatchObject({ status: 'pending' });
    const runs = automationRunsPageSchema.parse(
      await (await api.request('/api/v1/automations/dota-intelligence/runs?limit=2')).json()
    );
    expect(runs.items[0]?.status).toBe('skipped');
  });

  it('coalesces concurrent run-now requests and never creates two active D1 claims', async () => {
    const repo = createD1AutomationRepository(testDb());
    const [first, second] = await Promise.all([
      repo.enqueueManual({ id: 'dota-intelligence', actor: '4242', now: START, newId: () => crypto.randomUUID() }),
      repo.enqueueManual({ id: 'dota-intelligence', actor: '4242', now: START, newId: () => crypto.randomUUID() })
    ]);
    expect(first.run.id).toBe(second.run.id);
    expect([first.coalesced, second.coalesced].sort()).toEqual([false, true]);
    expect(
      await testDb()
        .prepare("SELECT count(*) AS total FROM automation_runs WHERE status IN ('queued', 'running')")
        .first()
    ).toEqual({ total: 1 });

    const api = createApi({ clock: fakeClock(START) });
    const coalesced = await api.request('/api/v1/automations/dota-intelligence/run-now', {
      method: 'POST',
      headers: { 'idempotency-key': 'coalesced-request' },
      json: {}
    });
    expect(coalesced.status).toBe(202);
    expect(runAutomationNowResponseSchema.parse(await coalesced.json())).toMatchObject({
      run: { id: first.run.id },
      coalesced: true
    });
  });

  it('makes the pause-versus-claim race binary: queued work is skipped or a claimed run continues', async () => {
    const api = createApi({ clock: fakeClock(START) });
    const enqueue = await api.request('/api/v1/automations/dota-intelligence/run-now', {
      method: 'POST',
      headers: { 'idempotency-key': 'race-run' },
      json: {}
    });
    expect(enqueue.status).toBe(202);
    const repo = createD1AutomationRepository(testDb());
    const [pause, claim] = await Promise.all([
      repo.transition({ id: 'dota-intelligence', enabled: false, revision: 0, actor: '4242', now: START + 1 }),
      repo.claimNext({ id: 'dota-intelligence', now: START + 1 })
    ]);
    expect(pause.automation.enabled).toBe(false);
    const rows = await testDb()
      .prepare("SELECT id, status FROM automation_runs WHERE automation_id = 'dota-intelligence'")
      .all<{ id: string; status: string }>();
    expect(rows.results).toHaveLength(1);
    if (claim === null) {
      expect(rows.results[0]?.status).toBe('skipped');
    } else {
      expect(rows.results[0]?.status).toBe('running');
      expect(await repo.finish({ runId: claim.id, now: START + 2, status: 'succeeded', outputCount: 0 })).toBe(true);
      expect(
        (
          await testDb()
            .prepare('SELECT status FROM automation_runs WHERE id = ?1')
            .bind(claim.id)
            .first<{ status: string }>()
        )?.status
      ).toBe('succeeded');
    }
    expect(rows.results[0]?.status).not.toBe('queued');
  });

  it('records at most one audit event for concurrent transitions at the same revision', async () => {
    const repo = createD1AutomationRepository(testDb());
    const results = await Promise.allSettled([
      repo.transition({ id: 'dota-intelligence', enabled: false, revision: 0, actor: '4242', now: START + 1 }),
      repo.transition({ id: 'dota-intelligence', enabled: false, revision: 0, actor: '4242', now: START + 1 })
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(
      await testDb()
        .prepare(
          "SELECT count(*) AS total FROM audit_log WHERE entity_id = 'dota-intelligence' AND action = 'automation.pause'"
        )
        .first()
    ).toEqual({ total: 1 });
  });

  it('uses indexed history queries and marks abandoned leases unknown without retry', async () => {
    const repo = createD1AutomationRepository(testDb());
    const requestedAt = START;
    const runId = crypto.randomUUID();
    await testDb()
      .prepare(
        `INSERT INTO automation_runs (id, automation_id, origin, status, requested_at, started_at, lease_until)
       VALUES (?1, 'dota-intelligence', 'manual', 'running', ?2, ?2, ?3)`
      )
      .bind(runId, requestedAt, requestedAt + 1)
      .run();
    expect(await repo.markExpiredUnknown(requestedAt + 1)).toBe(1);
    expect(await repo.claimNext({ id: 'dota-intelligence', now: requestedAt + 2 })).toBeNull();
    const history = await repo.listRuns({ id: 'dota-intelligence', limit: 20 });
    expect(history.items[0]).toMatchObject({ id: runId, status: 'unknown', errorCode: 'AUTOMATION_LEASE_EXPIRED' });
    const plan = await testDb()
      .prepare(
        `EXPLAIN QUERY PLAN SELECT id FROM automation_runs WHERE automation_id = ?1
       ORDER BY requested_at DESC, id DESC LIMIT ?2`
      )
      .bind('dota-intelligence', 20)
      .all<{ detail: string }>();
    expect(plan.results.some((row) => row.detail.includes('automation_runs_history_idx'))).toBe(true);
    const claimPlan = await testDb()
      .prepare(
        `EXPLAIN QUERY PLAN SELECT id FROM automation_runs
         WHERE automation_id = ?1 AND status = 'queued' ORDER BY requested_at, id LIMIT 1`
      )
      .bind('dota-intelligence')
      .all<{ detail: string }>();
    expect(claimPlan.results.some((row) => row.detail.includes('automation_runs_history_idx'))).toBe(true);
  });

  it('does not let run-now bypass the five-minute Dota polling cadence', async () => {
    const api = createApi({ clock: fakeClock(START) });
    await testDb()
      .prepare(
        `INSERT INTO automation_runs (id, automation_id, origin, status, requested_at, started_at, completed_at, output_count)
         VALUES (?1, 'dota-intelligence', 'manual', 'succeeded', ?2, ?2, ?3, 0)`
      )
      .bind(crypto.randomUUID(), START - 60_000, START - 30_000)
      .run();
    const summary = automationSummarySchema.parse(
      await (await api.request('/api/v1/automations/dota-intelligence')).json()
    );
    expect(summary.runNowAllowed).toBe(false);
    const response = await api.request('/api/v1/automations/dota-intelligence/run-now', {
      method: 'POST',
      headers: { 'idempotency-key': 'dota-run-too-soon' },
      json: {}
    });
    expect(response.status).toBe(409);
    expect(apiErrorSchema.parse(await response.json()).error.details).toMatchObject({ reason: 'RUN_NOT_DUE' });
  });
});
