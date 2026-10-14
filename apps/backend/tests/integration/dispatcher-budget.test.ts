import { beforeEach, describe, expect, it } from 'vitest';
import { PURGE_BATCH } from '../../src/modules/lifecycle/domain/archive-policy';
import { DISPATCH_BATCH, LEASE_MS } from '../../src/modules/publishing/domain/dispatch-policy';
import { ARCHIVE_RETENTION_MS } from '../../src/shared/archive-retention';
import { CLEANUP_LIMIT } from '../../src/app/scheduled';
import { createD1SystemState } from '../../src/app/system-state';
import { testDb } from '../helpers/db';
import { fakeTransport, HOURLY_TICK, makeTick, MINUTE_TICK, SENT, seedDueJob } from '../helpers/dispatch';
import { fakeOwnerMessenger } from '../helpers/fake-owner-messenger';
import { createApi, fakeClock, type FakeClock, OWNER_TOKEN, resetDb, seedSession, START } from '../helpers/harness';
import { meteredDb } from '../helpers/metered-db';
import { count, jobOf } from '../helpers/publishing';
import type { Api } from '../helpers/harness';

// The origin /start or connect stored, which the tick's owner alerts read.
const rememberOrigin = () => createD1SystemState(testDb()).rememberAppOrigin('https://studio.example.com', START);

const DAY = 24 * 60 * 60_000;
const HOUR = 60 * 60_000;

let clock: FakeClock;
let api: Api;

beforeEach(async () => {
  await resetDb();
  await seedSession({ token: OWNER_TOKEN, expiresAt: START + 400 * DAY });
  clock = fakeClock();
  api = createApi({ clock });
});

async function sql(statement: string, ...bindings: (string | number)[]): Promise<void> {
  await testDb()
    .prepare(statement)
    .bind(...bindings)
    .run();
}

// Hundreds of finished jobs without a publication: history the idle scans must never read. They
// finished an hour before START, outside the archive step's 15-minute window.
async function seedJobHistory(): Promise<void> {
  await sql(
    `WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 300)
     INSERT INTO jobs (id, kind, status, run_at, attempts, dedupe_key, created_at, updated_at)
     SELECT printf('%036d', i), 'publish', CASE WHEN i % 3 = 0 THEN 'cancelled' WHEN i % 3 = 1 THEN 'succeeded' ELSE 'failed' END,
            ?1 - i, 1, 'history:' || i, ?1 - i, ?1 - 3600000 - i FROM n`,
    START
  );
}

async function jobsDump(): Promise<string> {
  const { results } = await testDb()
    .prepare('SELECT id, status, run_at, lease_until, send_started_at, attempts, updated_at FROM jobs ORDER BY id')
    .all();
  return JSON.stringify(results);
}

describe('an idle tick', () => {
  it('keeps idle automation reconciliation and claims bounded alongside publishing reads', async () => {
    await seedJobHistory();
    // Waiting work that is not due, and a claim whose lease is still alive: neither may be touched.
    const future = await seedDueJob(api);
    await sql('UPDATE jobs SET run_at = ?1 WHERE id = ?2', START + HOUR, future.jobId);
    const live = await seedDueJob(api);
    await sql(
      "UPDATE jobs SET status = 'claimed', attempts = 1, lease_until = ?1 WHERE id = ?2",
      START + LEASE_MS,
      live.jobId
    );
    const before = await jobsDump();
    const writesBefore = [await count('job_attempts'), await count('incidents'), await count('audit_log')];

    const { db, meter } = meteredDb(testDb());
    const transport = fakeTransport(SENT);
    await makeTick({ clock, transport, db }).run();

    // Publishing scans, bounded alert bookkeeping, automation lease reconciliation and two claims, the bot media import read, heartbeat.
    expect(meter.roundTrips).toBe(10);
    expect(meter.statements).toBe(10);
    const writes = meter.sql.filter((statement) => !/^\s*SELECT\b/i.test(statement));
    expect(writes).toHaveLength(3);
    expect(writes[0]).toMatch(/^\s*DELETE FROM incident_alert_groups\b/);
    expect(writes[1]).toMatch(/^\s*UPDATE automation_runs\b/);
    expect(writes[2]).toMatch(/^\s*INSERT INTO system_state\b/);
    // Not zero: D1 counts a few reads even for an empty index range. The point is that it is a small
    // constant however long the finished history is (300 rows here).
    expect(meter.rowsRead).toBeLessThanOrEqual(16);
    expect(transport.calls).toHaveLength(0);
    expect(await jobsDump()).toBe(before);
    expect([await count('job_attempts'), await count('incidents'), await count('audit_log')]).toEqual(writesBefore);
  });

  it('the archive scan reads the jobs that finished inside its window, not the history before it', async () => {
    await seedJobHistory();
    await sql(
      `WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 5)
       INSERT INTO jobs (id, kind, status, run_at, attempts, dedupe_key, created_at, updated_at)
       SELECT printf('r%035d', i), 'publish', 'succeeded', ?1, 1, 'recent:' || i, ?1, ?1 - i FROM n`,
      START
    );

    const { db, meter } = meteredDb(testDb());
    await makeTick({ clock, transport: fakeTransport(SENT), db }).run();

    // Five recent finished jobs, none of them tied to a post, and nothing else.
    expect(meter.rowsRead).toBeLessThanOrEqual(8 + 5 + 2);
  });

  it('with publishing off it keeps automation checks bounded and records the heartbeat', async () => {
    await seedJobHistory();

    const { db, meter } = meteredDb(testDb());
    await makeTick({ clock, transport: fakeTransport(SENT), db, publishing: 'false' }).run();

    expect(meter.roundTrips).toBe(9);
    expect(meter.rowsRead).toBeLessThanOrEqual(12);
  });
});

describe('the budget of a busy tick (Free plan: 50 D1 queries, 50 subrequests)', () => {
  // The bounded worst mix: one reconciled incident, two due incident outcomes, one outcome batch retry,
  // hourly cleanup, archive, the two-alert page, and heartbeat. A third group remains eligible next tick.
  it('the worst mix (reconcile, a full batch with incidents, a write retry, hourly cleanup, owner alerts) fits 50 statements and 50 round trips', async () => {
    await rememberOrigin();
    const marked = await seedDueJob(api);
    await sql(
      "UPDATE jobs SET status = 'claimed', attempts = 1, lease_until = ?1, send_started_at = ?2 WHERE id = ?3",
      START - 1,
      START - 2,
      marked.jobId
    );
    const due = await Promise.all(Array.from({ length: DISPATCH_BATCH + 2 }, () => seedDueJob(api)));
    const transport = fakeTransport(
      { kind: 'unknown', reason: 'timeout' },
      { kind: 'rejected', code: 'CHAT_MIGRATED' },
      SENT
    );
    let failuresLeft = 1;

    const { db, meter } = meteredDb(testDb());
    const ownerMessenger = fakeOwnerMessenger();
    const tick = makeTick({
      clock,
      transport,
      db,
      ownerMessenger,
      scheduledTime: HOURLY_TICK,
      tweak: (container) => ({
        ...container,
        dispatchJobs: {
          ...container.dispatchJobs,
          resolve: async (resolution) => {
            if (failuresLeft > 0) {
              failuresLeft -= 1;
              // D1 executed the batch (it counts against the budget) but nothing took effect: a guard
              // that cannot hold stands for a failure that rolled back.
              await container.dispatchJobs.resolve({ ...resolution, attempt: resolution.attempt + 100 });
              throw new Error('D1 hiccup');
            }
            return container.dispatchJobs.resolve(resolution);
          }
        }
      })
    });
    await tick.run();

    // Grouping is by incident class and affected publication, so distinct publications alert separately.
    expect(tick.ownerMessages).toHaveLength(2);
    const subrequests = transport.calls.length + tick.ownerMessages.length;
    expect(transport.calls).toHaveLength(DISPATCH_BATCH);
    expect(await jobOf(marked.publicationId)).toMatchObject({ status: 'unknown' });
    expect(await count('incidents')).toBe(1 + DISPATCH_BATCH);
    expect(await count('posts', 'archived_at IS NOT NULL')).toBe(0);
    // Pinned: 49 statements and 28 round trips, leaving one statement of Free-plan headroom.
    expect(meter.statements).toBe(49);
    expect(meter.roundTrips).toBe(28);
    // Even if D1 counted every statement of a batch on its own, and Telegram calls beside them.
    expect(meter.statements).toBeLessThanOrEqual(50);
    expect(meter.roundTrips).toBeLessThanOrEqual(50);
    expect(meter.statements + subrequests).toBeLessThanOrEqual(50 + subrequests);
    const statuses = await Promise.all(due.map(async (job) => (await jobOf(job.publicationId)).status));
    expect(statuses.filter((status) => status === 'pending')).toHaveLength(2);

    clock.advance(60_000);
    await makeTick({ clock, transport: fakeTransport(SENT), ownerMessenger }).run();
    // The two sends of this tick are announced as «Опубликовано»; the incident alerts are counted apart.
    const sentNotices = tick.ownerMessages.filter((message) => message.html.includes('Опубликовано'));
    expect(sentNotices).toHaveLength(2);
    expect(tick.ownerMessages.length - sentNotices.length).toBe(3);
  });

  it('three successful sends cost 5 round trips each', async () => {
    await Promise.all(Array.from({ length: DISPATCH_BATCH }, () => seedDueJob(api)));

    const { db, meter } = meteredDb(testDb());
    await makeTick({ clock, transport: fakeTransport(SENT), db }).run();

    // Each sent post is archived by the same tick: one read and one batch of two for all three. The owner's
    // «Опубликовано» notices add two reads (app origin and notification settings, shared with the alerts).
    expect(meter.roundTrips).toBe(2 + 5 * DISPATCH_BATCH + 2 + 1 + 3 + 2);
    expect(meter.statements).toBe(2 + 8 * DISPATCH_BATCH + 3 + 1 + 3 + 2);
    expect(await count('posts', 'archived_at IS NOT NULL')).toBe(DISPATCH_BATCH);
  });
});

describe('the purge tick (minute 30, nothing due)', () => {
  it('a full batch of expired posts costs one read and one batch of seven, whatever the batch holds', async () => {
    await Promise.all(
      Array.from({ length: PURGE_BATCH }, async () => {
        const seeded = await seedDueJob(api);
        await sql('UPDATE jobs SET status = ?2, run_at = 0 WHERE id = ?1', seeded.jobId, 'succeeded');
        await sql('UPDATE posts SET archived_at = ?2 WHERE id = ?1', seeded.postId, START);
      })
    );
    clock.set(START + ARCHIVE_RETENTION_MS);

    const { db, meter } = meteredDb(testDb());
    await makeTick({ clock, transport: fakeTransport(SENT), db, scheduledTime: START + 30 * 60_000 }).run();

    // Every expired post had a sent publication, so each is a tombstone and its history stays.
    expect(await count('posts', 'deleted_at IS NOT NULL')).toBe(PURGE_BATCH);
    expect(await count('jobs')).toBe(PURGE_BATCH);
    // Reconciliation, due/archive/expired scans, automation reconciliation and two claims, then the audit row,
    // eight child deletes, the hard delete and the soft delete of the posts, and the heartbeat.
    expect(meter.roundTrips).toBe(12);
    expect(meter.statements).toBe(4 + 7 + 1 + 8 + 2);
  });

  it('an idle one costs one read more than a regular idle tick', async () => {
    const { db, meter } = meteredDb(testDb());

    await makeTick({ clock, transport: fakeTransport(SENT), db, scheduledTime: START + 30 * 60_000 }).run();

    expect(meter.roundTrips).toBe(11);
    // Reads only, except the heartbeat upsert at the end.
    expect(meter.sql.slice(0, 4).every((statement) => /^\s*SELECT\b/i.test(statement))).toBe(true);
    expect(meter.sql.at(-1)).toMatch(/^\s*INSERT INTO system_state\b/);
  });
});

async function seedExpiredRows(): Promise<void> {
  const hash = "printf('%064d', i)";
  const range = 'WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i <= 250)';
  await sql(
    `${range} INSERT INTO idempotency_keys (scope, key, request_hash, status, created_at, expires_at)
     SELECT '1', 'old-' || i, ${hash}, 'in_flight', ?1 - ?2, ?1 - ?2 + 1 FROM n`,
    START,
    2 * DAY
  );
  await sql(
    `${range} INSERT INTO rate_limits (bucket, window_start, count) SELECT 'old-' || i, ?1 - ?2, 1 FROM n`,
    START,
    3 * HOUR
  );
  await sql(
    `${range} INSERT INTO widget_sign_ins (hash_sha256, session_id, created_at, expires_at)
     SELECT ${hash}, 's' || i, ?1 - ?2, ?1 - ?2 + 1 FROM n`,
    START,
    2 * DAY
  );
  // Ended sessions (expired two days ago), each with a refresh token.
  await sql(
    `${range} INSERT INTO sessions (id, token_hash, telegram_id, kind, expires_at, created_at, hard_expires_at)
     SELECT 'old-' || i, printf('%064d', 20000 + i), '4242', 'browser', ?1 - ?2, ?1 - ?3, ?1 - ?2 FROM n`,
    START,
    2 * DAY,
    3 * DAY
  );
  await sql(
    `${range} INSERT INTO refresh_tokens (token_hash, session_id, created_at, expires_at)
     SELECT printf('%064d', 1000 + i), 'old-' || i, ?1 - ?3, ?1 - ?2 FROM n`,
    START,
    2 * DAY,
    3 * DAY
  );
}

async function seedLiveRows(): Promise<void> {
  await sql(
    "INSERT INTO idempotency_keys (scope, key, request_hash, status, created_at, expires_at) VALUES ('1', 'live', printf('%064d', 9), 'in_flight', ?1, ?2)",
    START,
    START + DAY
  );
  await sql("INSERT INTO rate_limits (bucket, window_start, count) VALUES ('live', ?1, 1)", START - 60_000);
  await sql(
    "INSERT INTO widget_sign_ins (hash_sha256, session_id, created_at, expires_at) VALUES (printf('%064d', 99999), 'live', ?1, ?2)",
    START,
    START + HOUR
  );
  // Live: the Mini App session of the owner (OWNER_TOKEN) is seeded by the harness; two more states
  // that must survive: revoked a moment ago (inside the grace period), expired a moment ago.
  await sql(
    "INSERT INTO sessions (id, token_hash, telegram_id, kind, expires_at, created_at, revoked_at, hard_expires_at) VALUES ('revoked-recently', printf('%064d', 7), '4242', 'browser', ?1, ?2, ?3, ?1)",
    START + HOUR,
    START - HOUR,
    START - HOUR
  );
  await sql(
    "INSERT INTO sessions (id, token_hash, telegram_id, kind, expires_at, created_at, hard_expires_at) VALUES ('expired-recently', printf('%064d', 8), '4242', 'browser', ?1, ?2, ?1)",
    START - HOUR,
    START - 2 * HOUR
  );
  await sql(
    "INSERT INTO refresh_tokens (token_hash, session_id, created_at, expires_at) VALUES (printf('%064d', 8), 'expired-recently', ?1, ?2)",
    START - 2 * HOUR,
    START + DAY
  );
}

const tables = ['idempotency_keys', 'rate_limits', 'widget_sign_ins', 'sessions', 'refresh_tokens'] as const;
const counts = async () =>
  Object.fromEntries(await Promise.all(tables.map(async (table) => [table, await count(table)])));

describe('hourly cleanup', () => {
  it('runs only on the tick of minute 0', async () => {
    await seedExpiredRows();
    await seedLiveRows();
    const before = await counts();

    await makeTick({ clock, transport: fakeTransport(SENT), scheduledTime: MINUTE_TICK }).run();
    expect(await counts()).toEqual(before);

    const hourly = makeTick({ clock, transport: fakeTransport(SENT), scheduledTime: HOURLY_TICK });
    await hourly.run();
    expect(await counts()).not.toEqual(before);
  });

  it('deletes at most CLEANUP_LIMIT rows of each table per tick and only the ended ones', async () => {
    await seedExpiredRows();
    await seedLiveRows();
    const before = await counts();

    const tick = makeTick({ clock, transport: fakeTransport(SENT), scheduledTime: HOURLY_TICK });
    await tick.run();

    const after = await counts();
    expect(CLEANUP_LIMIT).toBe(100);
    expect(before.idempotency_keys - after.idempotency_keys).toBe(CLEANUP_LIMIT);
    expect(before.rate_limits - after.rate_limits).toBe(CLEANUP_LIMIT);
    expect(before.widget_sign_ins - after.widget_sign_ins).toBe(CLEANUP_LIMIT);
    expect(before.sessions - after.sessions).toBe(CLEANUP_LIMIT);
    // Refresh tokens go with their sessions: none is left pointing at a deleted session.
    expect(before.refresh_tokens - after.refresh_tokens).toBe(CLEANUP_LIMIT);
    expect(await count('refresh_tokens', 'session_id NOT IN (SELECT id FROM sessions)')).toBe(0);
    // Everything live is still there.
    expect(await count('idempotency_keys', "key = 'live'")).toBe(1);
    expect(await count('rate_limits', "bucket = 'live'")).toBe(1);
    expect(await count('widget_sign_ins', "session_id = 'live'")).toBe(1);
    expect(await count('sessions', "id IN ('revoked-recently', 'expired-recently')")).toBe(2);
    expect(await count('refresh_tokens', "session_id = 'expired-recently'")).toBe(1);
    // The owner's own live session (seeded by the harness) is untouched.
    expect(await count('sessions', 'revoked_at IS NULL AND expires_at > ' + String(START))).toBe(1);

    // The leftovers go on the next hours' ticks.
    for (let round = 0; round < 2; round += 1) {
      await makeTick({ clock, transport: fakeTransport(SENT), scheduledTime: HOURLY_TICK }).run();
    }
    const last = await counts();
    expect(last.idempotency_keys).toBe(1);
    expect(last.rate_limits).toBe(1);
    expect(last.widget_sign_ins).toBe(1);
    expect(await count('sessions', "id LIKE 'old-%'")).toBe(0);
    expect(await count('refresh_tokens', "session_id LIKE 'old-%'")).toBe(0);
  });

  it('removes a revoked session once the grace period is over, even if its tokens are still valid', async () => {
    await sql(
      "INSERT INTO sessions (id, token_hash, telegram_id, kind, expires_at, created_at, revoked_at, hard_expires_at) VALUES ('revoked-long-ago', printf('%064d', 5), '4242', 'browser', ?1, ?2, ?3, ?1)",
      START + 30 * DAY,
      START - 3 * DAY,
      START - 2 * DAY
    );
    await sql(
      "INSERT INTO refresh_tokens (token_hash, session_id, created_at, expires_at) VALUES (printf('%064d', 5), 'revoked-long-ago', ?1, ?2)",
      START - 3 * DAY,
      START + 30 * DAY
    );

    await makeTick({ clock, transport: fakeTransport(SENT), scheduledTime: HOURLY_TICK }).run();

    expect(await count('sessions', "id = 'revoked-long-ago'")).toBe(0);
    expect(await count('refresh_tokens', "session_id = 'revoked-long-ago'")).toBe(0);
    expect(await count('sessions', 'revoked_at IS NULL AND expires_at > ' + String(START))).toBe(1);
  });
});
