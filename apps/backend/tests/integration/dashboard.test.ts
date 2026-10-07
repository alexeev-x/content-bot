import { type DashboardDto, dashboardSchema } from '@alexeev/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  ATTENTION_SQL,
  RECENT_SENT_SQL,
  STUCK_SQL,
  TODAY_SQL,
  UPCOMING_FROM_SQL
} from '../../src/modules/publishing/infrastructure/d1-dashboard-repository';
import { testDb } from '../helpers/db';
import { expectError } from '../helpers/expect-error';
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
import { insertIncident } from '../helpers/incidents';
import { meteredDb } from '../helpers/metered-db';
import { count, jobOf, seedApprovedPost, seedDestination, seedPublication } from '../helpers/publishing';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// The owner's "today" as the client would compute it: 12 hours either side of the fake "now".
const FROM = START - 12 * HOUR;
const TO = START + 12 * HOUR;
const query = (from = FROM, to = TO) =>
  `?from=${encodeURIComponent(new Date(from).toISOString())}&to=${encodeURIComponent(new Date(to).toISOString())}`;

let clock: FakeClock;
let api: Api;
let channel: { id: string };

beforeEach(async () => {
  await resetDb();
  await seedSession({ token: OWNER_TOKEN, expiresAt: START + 400 * DAY });
  clock = fakeClock();
  api = createApi({ clock });
  channel = await seedDestination(api, { title: 'Main channel', chatId: '-1001234567890' });
});

type JobStatus = 'pending' | 'claimed' | 'retry_wait' | 'succeeded' | 'failed' | 'unknown' | 'cancelled';

// A publication at `at`, created through the API and then moved to the job state a test needs.
async function seed(
  at: number,
  options: { title?: string; status?: JobStatus; destinationId?: string; messageId?: string } = {}
): Promise<{ publicationId: string; jobId: string }> {
  const post = await seedApprovedPost(api, options.title ?? 'Post');
  const created = await seedPublication(api, {
    postId: post.id,
    revision: post.revision,
    destinationId: options.destinationId ?? channel.id,
    // The API refuses a time more than five minutes back; the row is moved there below.
    scheduledAt: new Date(Math.max(at, START)).toISOString()
  });
  const db = testDb();
  await db.prepare('UPDATE publications SET scheduled_at = ?2 WHERE id = ?1').bind(created.id, at).run();
  await db
    .prepare('UPDATE jobs SET status = ?2, run_at = ?3 WHERE publication_id = ?1')
    .bind(created.id, options.status ?? 'pending', at)
    .run();
  if (options.status === 'succeeded') {
    await db
      .prepare('UPDATE publications SET external_message_id = ?2, updated_at = ?3 WHERE id = ?1')
      .bind(created.id, options.messageId ?? '501', at + MINUTE)
      .run();
  }
  return { publicationId: created.id, jobId: (await jobOf(created.id)).id };
}

async function dashboard(q = query()): Promise<DashboardDto> {
  const response = await api.request(`/api/v1/dashboard${q}`);
  expect(response.status).toBe(200);
  return dashboardSchema.parse(await response.json());
}

describe('GET /api/v1/dashboard', () => {
  it('is empty on a new install', async () => {
    expect(await dashboard()).toEqual({
      attention: [],
      attentionTotal: 0,
      today: [],
      todayTotal: 0,
      upcoming: [],
      recentSent: [],
      generatedAt: new Date(START).toISOString()
    });
  });

  it('lists today ascending with user-facing statuses, bounded to 8 with the total, cancelled and other days left out', async () => {
    await seed(START - 10 * HOUR, { title: 'Sent this morning', status: 'succeeded' });
    await seed(START + 6 * HOUR, { title: 'Evening' });
    for (let i = 1; i <= 8; i += 1) await seed(START + i * 10 * MINUTE, { title: `Slot ${i}` });
    await seed(START + 5 * MINUTE, { title: 'Withdrawn', status: 'cancelled' });
    await seed(START - 13 * HOUR, { title: 'Yesterday' });
    await seed(START + 13 * HOUR, { title: 'Tomorrow' });

    const result = await dashboard();

    expect(result.todayTotal).toBe(10);
    expect(result.today).toHaveLength(8);
    expect(result.today.map((item) => item.postTitle)).toEqual([
      'Sent this morning',
      'Slot 1',
      'Slot 2',
      'Slot 3',
      'Slot 4',
      'Slot 5',
      'Slot 6',
      'Slot 7'
    ]);
    expect(result.today.map((item) => item.status)).toEqual([
      'sent',
      'scheduled',
      'scheduled',
      'scheduled',
      'scheduled',
      'scheduled',
      'scheduled',
      'scheduled'
    ]);
    expect(result.today[0]).toMatchObject({
      destinationName: 'Main channel',
      scheduledAt: new Date(START - 10 * HOUR).toISOString()
    });
    const times = result.today.map((item) => item.scheduledAt);
    expect(times).toEqual([...times].sort());
  });

  it('projects the range edges: from is included, to is not', async () => {
    await seed(FROM, { title: 'At from' });
    await seed(TO, { title: 'At to' });

    const result = await dashboard();

    expect(result.today.map((item) => item.postTitle)).toEqual(['At from']);
    expect(result.upcoming.map((item) => item.postTitle)).toEqual(['At to']);
  });

  it('upcoming is the next 5 waiting after today, retries included, earliest first', async () => {
    for (let i = 1; i <= 6; i += 1) await seed(TO + i * HOUR, { title: `Later ${i}` });
    await seed(TO + 90 * MINUTE, { title: 'Retry', status: 'retry_wait' });
    await seed(TO + 30 * MINUTE, { title: 'Withdrawn', status: 'cancelled' });
    await seed(TO + 45 * MINUTE, { title: 'Done', status: 'succeeded' });
    await seed(START + HOUR, { title: 'Today' });

    const result = await dashboard();

    expect(result.upcoming.map((item) => item.postTitle)).toEqual([
      'Later 1',
      'Retry',
      'Later 2',
      'Later 3',
      'Later 4'
    ]);
    expect(result.upcoming.map((item) => item.status)).toEqual([
      'scheduled',
      'retry_wait',
      'scheduled',
      'scheduled',
      'scheduled'
    ]);
    expect(result.today.map((item) => item.postTitle)).toEqual(['Today']);
  });

  it('recentSent is the last 5 sent, latest first, with sentAt and a t.me link only for a public username', async () => {
    const publicChannel = await seedDestination(api, { title: 'Public', chatId: '@alexeev_news' });
    for (let i = 1; i <= 5; i += 1) {
      await seed(START - 20 * HOUR - i * HOUR, { title: `Old ${i}`, status: 'succeeded', messageId: String(100 + i) });
    }
    await seed(START - 14 * HOUR, { title: 'Newest private', status: 'succeeded', messageId: '77' });
    await seed(START - 15 * HOUR, {
      title: 'Newest public',
      status: 'succeeded',
      destinationId: publicChannel.id,
      messageId: '88'
    });
    await seed(START - 16 * HOUR, { title: 'Failed one', status: 'failed' });

    const result = await dashboard();

    expect(result.recentSent.map((item) => item.postTitle)).toEqual([
      'Newest private',
      'Newest public',
      'Old 1',
      'Old 2',
      'Old 3'
    ]);
    expect(result.recentSent.every((item) => item.status === 'sent')).toBe(true);
    expect(result.recentSent[0]).toMatchObject({ sentAt: new Date(START - 14 * HOUR + MINUTE).toISOString() });
    expect(result.recentSent[0]?.messageUrl).toBeUndefined();
    expect(result.recentSent[1]?.messageUrl).toBe('https://t.me/alexeev_news/88');
  });

  it('attention: unknown, then failed (newest first), then stuck, one row per incident, bounded to 5 with the total', async () => {
    const unknown = await seed(START - 3 * HOUR, { title: 'Maybe sent', status: 'unknown' });
    const failedOld = await seed(START - 5 * HOUR, { title: 'Failed old', status: 'failed' });
    const failedNew = await seed(START - 4 * HOUR, { title: 'Failed new', status: 'failed' });
    await seed(START - 11 * MINUTE, { title: 'Stuck' });
    await seed(START - 9 * MINUTE, { title: 'Late, not stuck yet' });
    await seed(START - 2 * HOUR, { title: 'Stuck oldest' });
    const incident = (
      id: string,
      publication: { publicationId: string; jobId: string },
      kind: 'publish_unknown' | 'publish_failed',
      createdAt: number,
      code: string
    ) =>
      insertIncident({ id, kind, code, createdAt, publicationId: publication.publicationId, jobId: publication.jobId });
    const ids = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
    await incident(ids[0] as string, unknown, 'publish_unknown', START - 2 * HOUR, 'SEND_UNCONFIRMED');
    await incident(ids[1] as string, failedOld, 'publish_failed', START - 100 * MINUTE, 'DESTINATION_UNAVAILABLE');
    await incident(ids[2] as string, failedNew, 'publish_failed', START - 90 * MINUTE, 'CONTENT_INVALID');
    // An acknowledged incident is no longer attention.
    await insertIncident({
      kind: 'publish_failed',
      createdAt: START - 6 * HOUR,
      resolvedAt: START - 5 * HOUR,
      publicationId: failedOld.publicationId,
      jobId: failedOld.jobId
    });

    const result = await dashboard();

    expect(result.attention.map((item) => item.kind)).toEqual(['unknown', 'failed', 'failed', 'stuck', 'stuck']);
    expect(result.attention.map((item) => item.postTitle)).toEqual([
      'Maybe sent',
      'Failed new',
      'Failed old',
      'Stuck oldest',
      'Stuck'
    ]);
    expect(result.attention[0]).toMatchObject({
      incidentId: ids[0],
      code: 'SEND_UNCONFIRMED',
      publicationId: unknown.publicationId,
      destinationName: 'Main channel',
      occurredAt: new Date(START - 2 * HOUR).toISOString()
    });
    expect(result.attention[3]).toMatchObject({
      kind: 'stuck',
      occurredAt: new Date(START - 2 * HOUR).toISOString(),
      scheduledAt: new Date(START - 2 * HOUR).toISOString()
    });
    expect(result.attention[3]?.incidentId).toBeUndefined();
    expect(result.attentionTotal).toBe(5);
  });

  it('attention is capped at 5 rows and the total at 99 however many things are wrong', async () => {
    for (let i = 0; i < 60; i += 1) await insertIncident({ createdAt: START - i });
    for (let i = 0; i < 60; i += 1)
      await insertIncident({ createdAt: START - i, kind: 'publish_unknown', code: 'SEND_UNCONFIRMED' });

    const result = await dashboard();

    expect(result.attention).toHaveLength(5);
    expect(result.attention.every((item) => item.kind === 'unknown')).toBe(true);
    expect(result.attention.every((item) => item.publicationId === undefined)).toBe(true);
    expect(result.attentionTotal).toBe(99);
  });

  it('a stuck threshold of 10 minutes: past due by 10 minutes and one millisecond is stuck, exactly 10 is not', async () => {
    await seed(START - 10 * MINUTE, { title: 'Exactly ten' });
    await seed(START - 10 * MINUTE - 1, { title: 'Just over' });

    const result = await dashboard();

    expect(result.attention.map((item) => item.postTitle)).toEqual(['Just over']);
  });

  it('truncates a long title to 120 characters and never returns a post body or incident details', async () => {
    const long = 'T'.repeat(200);
    const published = await seed(START - 3 * HOUR, { title: long, status: 'failed' });
    await insertIncident({
      createdAt: START - 2 * HOUR,
      publicationId: published.publicationId,
      jobId: published.jobId
    });
    await seed(START + HOUR, { title: long });

    const result = await dashboard();
    const raw = JSON.stringify(result);

    expect(result.attention[0]?.postTitle).toHaveLength(120);
    expect(result.today[0]?.postTitle).toHaveLength(120);
    expect(raw).not.toContain('Body text');
    expect(raw).not.toContain('secret-detail');
    expect(raw).not.toContain('details');
    expect(raw).not.toContain('body');
  });

  it.each([
    ['no range', ''],
    ['no to', `?from=${encodeURIComponent(new Date(FROM).toISOString())}`],
    ['a bad from', `?from=yesterday&to=${encodeURIComponent(new Date(TO).toISOString())}`],
    ['an offset instead of UTC', `?from=2026-10-07T00:00:00%2B03:00&to=2026-10-08T00:00:00Z`],
    ['a to before from', query(TO, FROM)],
    ['an empty range', query(FROM, FROM)],
    ['a range over 48 hours', query(FROM, FROM + 49 * HOUR)],
    ['an unknown parameter', `${query()}&foo=1`]
  ])('rejects %s with 400', async (_name, q) => {
    await expectError(await api.request(`/api/v1/dashboard${q}`), 400, 'VALIDATION_ERROR');
  });

  it('accepts a 25-hour day and a range of exactly 48 hours', async () => {
    expect((await api.request(`/api/v1/dashboard${query(FROM, FROM + 25 * HOUR)}`)).status).toBe(200);
    expect((await api.request(`/api/v1/dashboard${query(FROM, FROM + 48 * HOUR)}`)).status).toBe(200);
  });

  it('answers 401 without a token and 403 for another user, and reads nothing', async () => {
    await seedSession({ token: 'stranger-token-0000000000000000000000000', telegramId: '777' });
    const { db, meter } = meteredDb(testDb());
    const guarded = createApi({ clock, db });

    await expectError(await guarded.request(`/api/v1/dashboard${query()}`, { token: null }), 401, 'UNAUTHORIZED');
    await expectError(
      await guarded.request(`/api/v1/dashboard${query()}`, { token: 'stranger-token-0000000000000000000000000' }),
      403,
      'FORBIDDEN'
    );
    expect(meter.sql.filter((sql) => sql.includes('post_revisions'))).toEqual([]);
  });

  it('is one batch of five statements, each with a LIMIT, after the session lookup', async () => {
    await seed(START + HOUR);
    const { db, meter } = meteredDb(testDb());
    const metered = createApi({ clock, db });

    const response = await metered.request(`/api/v1/dashboard${query()}`);

    expect(response.status).toBe(200);
    // session lookup, then the batch
    expect(meter.roundTrips).toBe(2);
    expect(meter.statements).toBe(1 + 5);
    const dashboardSql = meter.sql.slice(1);
    expect(dashboardSql).toHaveLength(5);
    for (const sql of dashboardSql) expect(sql).toMatch(/\bLIMIT\b/);
    expect(await count('audit_log', "action LIKE 'incident.%'")).toBe(0);
  });

  it('changes nothing: publications, jobs and incidents are as they were', async () => {
    await seed(START + HOUR);
    await seed(START - 3 * HOUR, { status: 'failed' });
    const snapshot = async () =>
      JSON.stringify([
        (await testDb().prepare('SELECT id, status, run_at, attempts, updated_at FROM jobs ORDER BY id').all()).results,
        (await testDb().prepare('SELECT id, scheduled_at, revision, updated_at FROM publications ORDER BY id').all())
          .results,
        await testDb().prepare('SELECT count(*) AS n FROM audit_log').first()
      ]);
    const before = await snapshot();

    await dashboard();

    expect(await snapshot()).toBe(before);
  });
});

async function planOf(sql: string, ...bindings: (string | number)[]): Promise<string> {
  const { results } = await testDb()
    .prepare(`EXPLAIN QUERY PLAN ${sql}`)
    .bind(...bindings)
    .all<{ detail: string }>();
  return results.map((row) => row.detail).join('\n');
}

describe('dashboard queries never scan publications, jobs or incidents', () => {
  const noFullScan = (plan: string) => {
    // Every table of the five statements is reached through an index; a bare SCAN of a base table
    // is a full scan (a SCAN of a CTE/subquery name or `USING INDEX` is not).
    expect(plan).not.toMatch(/SCAN (publications|jobs|incidents|post_revisions|destinations|p|j|i|r|d)\s*$/m);
    expect(plan).not.toMatch(/SCAN (publications|jobs|incidents|post_revisions|destinations|p|j|i|r|d) (?!USING)/);
  };

  it('attention walks incidents_open_idx and joins by key', async () => {
    const plan = await planOf(ATTENTION_SQL);
    expect(plan).toContain('SCAN incidents USING INDEX incidents_open_idx');
    expect(plan).not.toMatch(/USING (COVERING )?INDEX incidents_resolved/);
    noFullScan(plan);
  });

  it('stuck walks the partial jobs_due index', async () => {
    const plan = await planOf(STUCK_SQL, START);
    expect(plan).toContain('USING INDEX jobs_due (status=? AND run_at<?)');
    noFullScan(plan);
  });

  it('today reads the range from publications_scheduled_idx, no sort', async () => {
    const plan = await planOf(TODAY_SQL, FROM, TO);
    expect(plan).toContain('INDEX publications_scheduled_idx (scheduled_at>? AND scheduled_at<?)');
    expect(plan).not.toContain('TEMP B-TREE');
    noFullScan(plan);
  });

  it('upcoming seeks jobs_due once per status', async () => {
    const plan = await planOf(UPCOMING_FROM_SQL, TO);
    expect(plan.match(/USING INDEX jobs_due \(status=\? AND run_at>\?\)/g)).toHaveLength(2);
    noFullScan(plan);
  });

  it('recent sent seeks the succeeded jobs in jobs_status_scheduled_idx', async () => {
    const plan = await planOf(RECENT_SENT_SQL);
    expect(plan).toContain('USING INDEX jobs_status_scheduled_idx (status=?)');
    noFullScan(plan);
  });
});
