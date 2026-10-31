import { beforeEach, describe, expect, it } from 'vitest';
import {
  createD1DispatchRepository,
  LATE_JOBS_SQL
} from '../../src/modules/publishing/infrastructure/d1-dispatch-repository';
import { classifySendResult } from '../../src/modules/publishing/infrastructure/classify-telegram-result';
import { createD1PublicationOutcomesRepository } from '../../src/modules/publishing/infrastructure/d1-publication-outcomes-repository';
import { readPublicationOutcomes } from '../../src/modules/publishing';
import { testDb } from '../helpers/db';
import { fakeTransport, makeTick, MINUTE_TICK, SENT, seedDueJob } from '../helpers/dispatch';
import {
  type Api,
  createApi,
  fakeClock,
  type FakeClock,
  OWNER_TOKEN,
  resetDb,
  seedSession,
  START
} from '../helpers/harness';
import { claimJob, jobOf } from '../helpers/publishing';

// Migration 0117 (rubric scheduler stage 1): a post past its `not_after` never goes out late, and a sent poll keeps its
// id. Every test asserts D1, not mock calls.

let clock: FakeClock;
let api: Api;

beforeEach(async () => {
  await resetDb();
  await seedSession({ token: OWNER_TOKEN, expiresAt: START + 400 * 24 * 60 * 60_000 });
  clock = fakeClock();
  api = createApi({ clock });
});

const setNotAfter = (jobId: string, notAfter: number) =>
  testDb().prepare('UPDATE jobs SET not_after = ?2 WHERE id = ?1').bind(jobId, notAfter).run();

const publicationRow = (id: string) =>
  testDb()
    .prepare('SELECT last_error_code, external_poll_id, revision FROM publications WHERE id = ?1')
    .bind(id)
    .first<{ last_error_code: string | null; external_poll_id: string | null; revision: number }>();

describe('not_after', () => {
  it('walks the deadline index for late jobs', async () => {
    const { results } = await testDb()
      .prepare(`EXPLAIN QUERY PLAN ${LATE_JOBS_SQL}`)
      .bind(START, 20)
      .all<{ detail: string }>();
    expect(results.map((row) => row.detail).join('\n')).toMatch(/USING (COVERING )?INDEX jobs_not_after_idx/);
  });

  it('sends a job once when two ticks race for it before its deadline', async () => {
    const seeded = await seedDueJob(api);
    await setNotAfter(seeded.jobId, MINUTE_TICK + 60_000);
    const transport = fakeTransport(SENT);
    const first = makeTick({ clock, transport });
    const second = makeTick({ clock, transport });

    await Promise.all([first.run(), second.run()]);

    expect(transport.calls).toHaveLength(1);
    expect((await jobOf(seeded.publicationId)).status).toBe('succeeded');
  });

  it('never claims a job past its deadline and cancels it, with the kill switch off too', async () => {
    const seeded = await seedDueJob(api);
    await setNotAfter(seeded.jobId, START + 60_000);
    clock.advance(2 * 60_000);
    expect(await claimJobWithDeadline(seeded.jobId, clock.now())).toBe(0);
    const transport = fakeTransport(SENT);

    await makeTick({ clock, transport, publishing: 'false' }).run();

    expect(transport.calls).toHaveLength(0);
    expect((await jobOf(seeded.publicationId)).status).toBe('cancelled');
    expect(await publicationRow(seeded.publicationId)).toMatchObject({ last_error_code: 'NOT_AFTER_PASSED' });
    const audit = await testDb()
      .prepare("SELECT count(*) AS n FROM audit_log WHERE action = 'job.expired' AND entity_id = ?1")
      .bind(seeded.publicationId)
      .first<{ n: number }>();
    expect(audit?.n).toBe(1);
    const incidents = await testDb().prepare('SELECT count(*) AS n FROM incidents').first<{ n: number }>();
    expect(incidents?.n).toBe(0);
  });

  it('leaves a claimed or unknown job past its deadline alone', async () => {
    const claimed = await seedDueJob(api);
    const unknown = await seedDueJob(api);
    await claimJob(claimed.jobId, START, MINUTE_TICK + 120_000);
    await testDb().prepare("UPDATE jobs SET status = 'unknown' WHERE id = ?1").bind(unknown.jobId).run();
    await setNotAfter(claimed.jobId, START + 1);
    await setNotAfter(unknown.jobId, START + 1);

    const cancelled = await createD1DispatchRepository(testDb()).cancelLateJobs(MINUTE_TICK, 20);

    expect(cancelled).toEqual([]);
    expect((await jobOf(claimed.publicationId)).status).toBe('claimed');
    expect((await jobOf(unknown.publicationId)).status).toBe('unknown');
  });

  it('cancels a retry whose wait runs past the deadline instead of sending it late', async () => {
    const seeded = await seedDueJob(api);
    await setNotAfter(seeded.jobId, MINUTE_TICK + 60_000);
    await makeTick({ clock, transport: fakeTransport({ kind: 'rate_limited', retryAfterSec: 600 }) }).run();
    expect((await jobOf(seeded.publicationId)).status).toBe('retry_wait');

    clock.advance(11 * 60_000);
    const transport = fakeTransport(SENT);
    await makeTick({ clock, transport, scheduledTime: MINUTE_TICK + 11 * 60_000 }).run();

    expect(transport.calls).toHaveLength(0);
    expect((await jobOf(seeded.publicationId)).status).toBe('cancelled');
  });

  it('drops the deadline when the owner reschedules', async () => {
    const seeded = await seedDueJob(api);
    await setNotAfter(seeded.jobId, START + 60_000);
    const current = await publicationRow(seeded.publicationId);

    const response = await api.request(`/api/v1/publications/${seeded.publicationId}/reschedule`, {
      method: 'POST',
      json: { revision: current?.revision, scheduledAt: new Date(START + 3_600_000).toISOString(), timezone: 'UTC' }
    });

    expect(response.status).toBe(200);
    const job = await testDb()
      .prepare('SELECT not_after FROM jobs WHERE id = ?1')
      .bind(seeded.jobId)
      .first<{ not_after: number | null }>();
    expect(job?.not_after).toBeNull();
  });
});

describe('poll id', () => {
  it('stores a sent poll id and shows it to the scheduler', async () => {
    const seeded = await seedDueJob(api);
    await makeTick({
      clock,
      transport: fakeTransport({ kind: 'sent', externalMessageIds: ['77'], externalPollId: 'poll-5001' })
    }).run();

    expect(await publicationRow(seeded.publicationId)).toMatchObject({ external_poll_id: 'poll-5001' });
    const [outcome] = await readPublicationOutcomes(
      { repo: createD1PublicationOutcomesRepository(testDb()), now: clock.now() },
      [seeded.publicationId]
    );
    expect(outcome).toMatchObject({ status: 'sent', externalPollId: 'poll-5001', externalMessageIds: ['77'] });
  });

  it('keeps a confirmed poll message sent when Telegram gave no poll id', () => {
    expect(classifySendResult({ message_id: 9 })).toEqual({ kind: 'sent', externalMessageIds: ['9'] });
    expect(classifySendResult({ message_id: 9, poll: { id: 'p1' } })).toEqual({
      kind: 'sent',
      externalMessageIds: ['9'],
      externalPollId: 'p1'
    });
  });
});

describe('a production database without migration 0117', () => {
  it('keeps sending on the old statements and says so once', async () => {
    const db = testDb();
    await db.batch([
      db.prepare('DROP INDEX jobs_not_after_idx'),
      db.prepare('ALTER TABLE jobs DROP COLUMN not_after'),
      db.prepare('DROP INDEX publications_poll_idx'),
      db.prepare('ALTER TABLE publications DROP COLUMN external_poll_id')
    ]);
    try {
      const seeded = await seedDueJob(api);
      let behind = 0;
      const repo = createD1DispatchRepository(db, () => {
        behind += 1;
      });
      const transport = fakeTransport({ kind: 'sent', externalMessageIds: ['5'], externalPollId: 'p' });

      const tick = makeTick({ clock, transport, tweak: (container) => ({ ...container, dispatchJobs: repo }) });
      await tick.run();

      expect(transport.calls).toHaveLength(1);
      expect((await jobOf(seeded.publicationId)).status).toBe('succeeded');
      expect(behind).toBe(1);
      expect(repo.schemaBehind()).toBe(true);
    } finally {
      await db.batch([
        db.prepare('ALTER TABLE jobs ADD COLUMN not_after INTEGER CHECK (not_after IS NULL OR not_after > 0)'),
        db.prepare(
          `CREATE INDEX jobs_not_after_idx ON jobs (not_after, id)
             WHERE not_after IS NOT NULL AND status IN ('pending', 'retry_wait')`
        ),
        db.prepare(
          `ALTER TABLE publications ADD COLUMN external_poll_id TEXT
             CHECK (external_poll_id IS NULL OR length(external_poll_id) BETWEEN 1 AND 64)`
        ),
        db.prepare(
          'CREATE INDEX publications_poll_idx ON publications (external_poll_id) WHERE external_poll_id IS NOT NULL'
        )
      ]);
    }
  });
});

// The production claim with the deadline (d1-dispatch-repository.ts); 1 = this caller won.
async function claimJobWithDeadline(jobId: string, now: number): Promise<number> {
  const claimed = await createD1DispatchRepository(testDb()).claim(jobId, now, now + 60_000);
  return claimed === null ? 0 : 1;
}
