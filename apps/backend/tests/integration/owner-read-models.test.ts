import { beforeEach, describe, expect, it } from 'vitest';
import { createD1SystemState } from '../../src/app/system-state';
import { createD1DispatchRepository, createD1PublicationRepository } from '../../src/modules/publishing';
import { testDb } from '../helpers/db';
import { fakeTransport, makeTick, seedDueJob } from '../helpers/dispatch';
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
import { seedApprovedPost, seedDestination, seedPublication } from '../helpers/publishing';

const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;

let clock: FakeClock;
let api: Api;

beforeEach(async () => {
  await resetDb();
  await seedSession({ token: OWNER_TOKEN, expiresAt: START + 400 * DAY });
  clock = fakeClock();
  api = createApi({ clock });
});

async function schedule(offsetMs: number, title = 'Пост', channel?: { id: string }): Promise<string> {
  const post = await seedApprovedPost(api, title);
  const destination = channel ?? (await seedDestination(api));
  const publication = await seedPublication(api, {
    postId: post.id,
    revision: post.revision,
    destinationId: destination.id,
    scheduledAt: new Date(START + offsetMs).toISOString()
  });
  return publication.id;
}

const publications = () => createD1PublicationRepository(testDb());

describe('listUpcoming', () => {
  it('returns the earliest waiting publications first, retries included, never finished or cancelled ones', async () => {
    const channel = await seedDestination(api, { title: 'Канал' });
    const third = await schedule(3 * HOUR, 'Третий', channel);
    const first = await schedule(1 * HOUR, 'Первый', channel);
    const second = await schedule(2 * HOUR, 'Второй', channel);
    const cancelled = await schedule(30 * 60_000, 'Отменён', channel);
    await testDb().prepare("UPDATE jobs SET status = 'cancelled' WHERE publication_id = ?1").bind(cancelled).run();
    // A job that waits for a retry competes by its own run time.
    await testDb()
      .prepare("UPDATE jobs SET status = 'retry_wait', run_at = ?2 WHERE publication_id = ?1")
      .bind(second, START + 90 * 60_000)
      .run();

    const upcoming = await publications().listUpcoming(5);

    expect(upcoming.map((item) => item.id)).toEqual([first, second, third]);
    expect(upcoming[0]).toMatchObject({ destinationTitle: 'Канал', timezone: 'Europe/Moscow' });
  });

  it('stops at the limit', async () => {
    const channel = await seedDestination(api);
    for (let i = 1; i <= 4; i += 1) await schedule(i * HOUR, `Пост ${i}`, channel);

    expect(await publications().listUpcoming(2)).toHaveLength(2);
  });
});

describe('summarizeRange', () => {
  it('counts by user-facing status inside [from, to) and reports the earliest waiting time', async () => {
    const from = START;
    const to = START + DAY;
    await schedule(-1, 'Вчера');
    const sentTodayId = await schedule(0, 'Начало дня');
    await schedule(2 * HOUR, 'Ждёт');
    await schedule(5 * HOUR, 'Ждёт позже');
    await schedule(DAY, 'Завтра');
    // The one at `from` was sent; the other pending jobs are not due yet.
    await testDb().prepare("UPDATE jobs SET status = 'succeeded' WHERE publication_id = ?1").bind(sentTodayId).run();

    const summary = await publications().summarizeRange({ from, to, now: START + HOUR });

    expect(summary.counts).toMatchObject({ scheduled: 2, sent: 1, failed: 0, unknown: 0 });
    expect(summary.nextWaitingAt).toBe(START + 2 * HOUR);
  });

  it('tells a queued job (due, unclaimed) from a scheduled one by `now`', async () => {
    await schedule(2 * HOUR);

    const before = await publications().summarizeRange({ from: START, to: START + DAY, now: START });
    const after = await publications().summarizeRange({ from: START, to: START + DAY, now: START + 3 * HOUR });

    expect(before.counts).toMatchObject({ scheduled: 1, queued: 0 });
    expect(after.counts).toMatchObject({ scheduled: 0, queued: 1 });
  });

  it('is empty for an empty range', async () => {
    const summary = await publications().summarizeRange({ from: START, to: START + DAY, now: START });
    expect(Object.values(summary.counts).every((n) => n === 0)).toBe(true);
    expect(summary.nextWaitingAt).toBeNull();
  });
});

describe('countOpenIncidents', () => {
  it('counts the unresolved ones, up to the limit', async () => {
    for (let i = 0; i < 3; i += 1) {
      await seedDueJob(api);
    }
    await makeTick({ clock, transport: fakeTransport({ kind: 'rejected', code: 'CONTENT_INVALID' }) }).run();
    await makeTick({ clock, transport: fakeTransport({ kind: 'rejected', code: 'CONTENT_INVALID' }) }).run();
    const repo = createD1DispatchRepository(testDb());

    expect(await repo.countOpenIncidents(10)).toBe(3);
    expect(await repo.countOpenIncidents(2)).toBe(2);
    await testDb().prepare('UPDATE incidents SET resolved_at = created_at').run();
    expect(await repo.countOpenIncidents(10)).toBe(0);
  });
});

describe('claimOwnerNotices', () => {
  it('returns only the ids it set, and sets each once', async () => {
    await seedDueJob(api);
    await seedDueJob(api);
    await makeTick({ clock, transport: fakeTransport({ kind: 'rejected', code: 'CONTENT_INVALID' }) }).run();
    await testDb().prepare('UPDATE incidents SET owner_notified_at = NULL').run();
    const { results } = await testDb().prepare('SELECT id FROM incidents ORDER BY id').all<{ id: string }>();
    const [a, b] = results.map((row) => row.id) as [string, string];
    const repo = createD1DispatchRepository(testDb());

    expect(await repo.claimOwnerNotices([a], START)).toEqual([a]);
    expect((await repo.claimOwnerNotices([a, b, crypto.randomUUID()], START + 1)).sort()).toEqual([b]);
    expect(await repo.claimOwnerNotices([a, b], START + 2)).toEqual([]);
    expect(await repo.claimOwnerNotices([], START)).toEqual([]);
    const stamped = await testDb()
      .prepare('SELECT owner_notified_at FROM incidents WHERE id = ?1')
      .bind(a)
      .first<{ owner_notified_at: number }>();
    expect(stamped?.owner_notified_at).toBe(START);
  });
});

describe('system state', () => {
  it('stores and reads the last Cron run', async () => {
    const state = createD1SystemState(testDb());
    expect(await state.readCronRun()).toBeNull();

    await state.recordCronRun({ at: START, status: 'ok', durationMs: 12 });
    await state.recordCronRun({ at: START + 60_000, status: 'error', durationMs: 40 });

    expect(await state.readCronRun()).toEqual({ at: START + 60_000, status: 'error', durationMs: 40 });
  });

  it('treats a row it cannot read as absent', async () => {
    const state = createD1SystemState(testDb());
    await testDb()
      .prepare(
        'INSERT INTO system_state (key, value, updated_at) VALUES (\'cron_last_run\', \'{"status":"maybe"}\', ?1)'
      )
      .bind(START)
      .run();
    await testDb()
      .prepare(
        'INSERT INTO system_state (key, value, updated_at) VALUES (\'app_origin\', \'{"origin":"javascript:alert(1)"}\', ?1)'
      )
      .bind(START)
      .run();

    expect(await state.readCronRun()).toBeNull();
    expect(await state.readAppOrigin()).toBeNull();
  });

  it('keeps only an https origin (or a loopback one) and rewrites it only when it changed', async () => {
    const state = createD1SystemState(testDb());
    await state.rememberAppOrigin('https://studio.example.com', START);
    await state.rememberAppOrigin('https://studio.example.com', START + 5);
    expect(await state.readAppOrigin()).toBe('https://studio.example.com');
    const row = await testDb().prepare("SELECT updated_at FROM system_state WHERE key = 'app_origin'").first();
    expect(row).toEqual({ updated_at: START });

    await state.rememberAppOrigin('http://evil.example.com', START + 10);
    expect(await state.readAppOrigin()).toBeNull();
    await state.rememberAppOrigin('http://localhost:8790', START + 20);
    expect(await state.readAppOrigin()).toBe('http://localhost:8790');
  });
});
