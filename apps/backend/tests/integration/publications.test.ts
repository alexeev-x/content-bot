import { type PublicationDto, publicationPageSchema, publicationSchema } from '@alexeev/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { sha256Hex } from '../../src/platform/security/sha256';
import { testDb } from '../helpers/db';
import { fakeOwnerMessenger } from '../helpers/fake-owner-messenger';
import { expectError } from '../helpers/expect-error';
import { type Api, createApi, fakeClock, OWNER_ID, OWNER_TOKEN, resetDb, seedSession, START } from '../helpers/harness';
import {
  claimJob,
  count,
  jobOf,
  seedApprovedPost,
  seedDestination,
  seedDraftPost,
  seedPublication
} from '../helpers/publishing';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const iso = (ms: number) => new Date(ms).toISOString();

let api: Api;
let postId: string;
let postRevision: number;
let destinationId: string;
let keyCounter = 0;

beforeEach(async () => {
  await resetDb();
  await seedSession({ token: OWNER_TOKEN, expiresAt: START + 400 * DAY });
  keyCounter = 0;
  api = createApi({ clock: fakeClock() });
  const post = await seedApprovedPost(api);
  postId = post.id;
  postRevision = post.revision;
  destinationId = (await seedDestination(api)).id;
});

const nextKey = () => `pub-key-${++keyCounter}`;

function schedule(overrides: Record<string, unknown> = {}, key: string | null = nextKey()) {
  return api.request('/api/v1/publications', {
    method: 'POST',
    headers: key === null ? {} : { 'idempotency-key': key },
    json: {
      postId,
      revision: postRevision,
      destinationId,
      scheduledAt: iso(START + 10 * MINUTE),
      timezone: 'Europe/Moscow',
      ...overrides
    }
  });
}

async function scheduleOk(overrides: Record<string, unknown> = {}): Promise<PublicationDto> {
  const response = await schedule(overrides);
  expect(response.status).toBe(202);
  return publicationSchema.parse(await response.json());
}

const cancel = (id: string, json: unknown) =>
  api.request(`/api/v1/publications/${id}/cancel`, { method: 'POST', json });
const reschedule = (id: string, json: unknown) =>
  api.request(`/api/v1/publications/${id}/reschedule`, { method: 'POST', json });
const get = async (id: string) =>
  publicationSchema.parse(await (await api.request(`/api/v1/publications/${id}`)).json());

async function setJob(
  publicationId: string,
  fields: { status?: string; run_at?: number; lease_until?: number | null; send_started_at?: number | null }
) {
  const job = await jobOf(publicationId);
  await testDb()
    .prepare('UPDATE jobs SET status = ?2, run_at = ?3, lease_until = ?4, send_started_at = ?5 WHERE id = ?1')
    .bind(
      job.id,
      fields.status ?? job.status,
      fields.run_at ?? job.run_at,
      fields.lease_until === undefined ? job.lease_until : fields.lease_until,
      fields.send_started_at === undefined ? job.send_started_at : fields.send_started_at
    )
    .run();
}

describe('POST /api/v1/publications', () => {
  it('stores the intent with a pending job and an audit row, and answers 202 scheduled', async () => {
    const scheduledAt = START + 10 * MINUTE;

    const publication = await scheduleOk({ scheduledAt: iso(scheduledAt), timezone: 'Asia/Tokyo' });

    expect(publication).toMatchObject({
      postId,
      postRevision,
      destinationId,
      status: 'scheduled',
      scheduledAt: iso(scheduledAt),
      timezone: 'Asia/Tokyo',
      revision: 0,
      createdAt: iso(START),
      updatedAt: iso(START)
    });
    expect(publication).not.toHaveProperty('externalMessageId');
    expect(publication).not.toHaveProperty('lastErrorCode');
    expect(await jobOf(publication.id)).toMatchObject({
      status: 'pending',
      run_at: scheduledAt,
      lease_until: null,
      send_started_at: null,
      attempts: 0,
      dedupe_key: `publish:${publication.id}`
    });
    const audit = await testDb()
      .prepare(
        "SELECT actor_telegram_id, entity_type, entity_id, details FROM audit_log WHERE action = 'publication.create'"
      )
      .all<{ actor_telegram_id: string; entity_type: string; entity_id: string; details: string }>();
    expect(audit.results).toHaveLength(1);
    expect(audit.results[0]).toMatchObject({
      actor_telegram_id: OWNER_ID,
      entity_type: 'publication',
      entity_id: publication.id
    });
    expect(JSON.parse(audit.results[0]?.details ?? '')).toEqual({ postId, postRevision, destinationId });
  });

  it('answers queued when the time is already due', async () => {
    const publication = await scheduleOk({ scheduledAt: iso(START - MINUTE) });

    expect(publication.status).toBe('queued');
    expect((await jobOf(publication.id)).run_at).toBe(START - MINUTE);
  });

  it('accepts the exact edges of the window and refuses one millisecond beyond', async () => {
    expect((await schedule({ scheduledAt: iso(START - 5 * MINUTE) })).status).toBe(202);
    expect((await schedule({ scheduledAt: iso(START + 366 * DAY) })).status).toBe(202);
    const before = await count('publications');

    await expectError(await schedule({ scheduledAt: iso(START - 5 * MINUTE - 1) }), 400, 'VALIDATION_ERROR', {
      reason: 'SCHEDULE_OUT_OF_RANGE'
    });
    await expectError(await schedule({ scheduledAt: iso(START + 366 * DAY + 1) }), 400, 'VALIDATION_ERROR', {
      reason: 'SCHEDULE_OUT_OF_RANGE'
    });

    expect(await count('publications')).toBe(before);
    expect(await count('jobs')).toBe(before);
  });

  it('frees the key after a refusal so the corrected request can reuse it', async () => {
    await expectError(await schedule({ scheduledAt: iso(START - DAY) }, 'fix-me'), 400, 'VALIDATION_ERROR');
    expect(await count('idempotency_keys', "key = 'fix-me'")).toBe(0);

    const retry = await schedule({ scheduledAt: iso(START + MINUTE) }, 'fix-me');

    expect(retry.status).toBe(202);
  });

  it('replays the original response without a second publication, job or audit row', async () => {
    const first = publicationSchema.parse(await (await schedule({}, 'same')).json());
    await cancel(first.id, { revision: 0 });

    const replay = await schedule({}, 'same');

    expect(replay.status).toBe(202);
    expect(publicationSchema.parse(await replay.json())).toEqual(first);
    expect(await count('publications')).toBe(1);
    expect(await count('jobs')).toBe(1);
    expect(await count('audit_log', "action = 'publication.create'")).toBe(1);
  });

  it('replays within the 24 h window even after the schedule time left the accepted range', async () => {
    const first = publicationSchema.parse(await (await schedule({ scheduledAt: iso(START) }, 'late')).json());
    api.clock.advance(60 * MINUTE);

    const replay = await schedule({ scheduledAt: iso(START) }, 'late');

    expect(replay.status).toBe(202);
    expect(publicationSchema.parse(await replay.json())).toEqual(first);
  });

  it('treats two spellings of the same instant as the same request', async () => {
    const first = await schedule({ scheduledAt: '2027-01-15T08:10:00Z' }, 'spelling');
    const second = await schedule({ scheduledAt: '2027-01-15T08:10:00.000Z' }, 'spelling');

    expect(first.status).toBe(202);
    expect(second.status).toBe(202);
    expect(await count('publications')).toBe(1);
  });

  it('stores and echoes a time zone alias under its canonical name', async () => {
    const publication = await scheduleOk({ timezone: 'europe/moscow' });

    expect(publication.timezone).toBe('Europe/Moscow');
    const row = await testDb()
      .prepare('SELECT timezone FROM publications WHERE id = ?1')
      .bind(publication.id)
      .first<{ timezone: string }>();
    expect(row?.timezone).toBe('Europe/Moscow');
  });

  it('treats two spellings of the same time zone as the same request', async () => {
    const first = await schedule({ timezone: 'EST5EDT' }, 'zone-alias');
    const second = await schedule({ timezone: 'America/New_York' }, 'zone-alias');

    expect(first.status).toBe(202);
    expect(second.status).toBe(202);
    expect(publicationSchema.parse(await second.json())).toEqual(publicationSchema.parse(await first.json()));
    expect(await count('publications')).toBe(1);
  });

  it('answers 409 IDEMPOTENCY_KEY_REUSED when the key comes with another payload', async () => {
    await schedule({}, 'reused');

    await expectError(await schedule({ timezone: 'Asia/Tokyo' }, 'reused'), 409, 'CONFLICT', {
      reason: 'IDEMPOTENCY_KEY_REUSED'
    });
    expect(await count('publications')).toBe(1);
  });

  it('answers 409 IN_FLIGHT while another request with the key is still running', async () => {
    const scheduledAt = START + 10 * MINUTE;
    const hash = await sha256Hex(
      JSON.stringify({ postId, revision: postRevision, destinationId, scheduledAt, timezone: 'Europe/Moscow' })
    );
    await testDb()
      .prepare(
        `INSERT INTO idempotency_keys (scope, key, request_hash, status, created_at, expires_at)
         VALUES (?1, 'flying', ?2, 'in_flight', ?3, ?4)`
      )
      .bind(OWNER_ID, hash, START - 1_000, START + 59_000)
      .run();

    await expectError(await schedule({}, 'flying'), 409, 'CONFLICT', { reason: 'IN_FLIGHT' });
    expect(await count('publications')).toBe(0);
  });

  it('creates exactly one publication and one job when the same key is sent twice at once', async () => {
    const responses = await Promise.all([schedule({}, 'twin'), schedule({}, 'twin')]);

    const statuses = responses.map((response) => response.status).sort();
    expect(statuses[0]).toBe(202);
    expect([202, 409]).toContain(statuses[1]);
    expect(await count('publications')).toBe(1);
    expect(await count('jobs')).toBe(1);
    expect(await count('audit_log', "action = 'publication.create'")).toBe(1);
  });

  it('answers 404 POST_NOT_FOUND and DESTINATION_NOT_FOUND', async () => {
    await expectError(await schedule({ postId: crypto.randomUUID() }), 404, 'NOT_FOUND', {
      reason: 'POST_NOT_FOUND'
    });
    await expectError(await schedule({ destinationId: crypto.randomUUID() }), 404, 'NOT_FOUND', {
      reason: 'DESTINATION_NOT_FOUND'
    });
    expect(await count('publications')).toBe(0);
  });

  it('answers 409 POST_NOT_APPROVED for a draft and accepts it once approved, with the same key', async () => {
    const draft = await seedDraftPost(api);

    await expectError(await schedule({ postId: draft.id, revision: draft.revision }, 'draft-key'), 409, 'CONFLICT', {
      reason: 'POST_NOT_APPROVED'
    });
    expect(await count('publications')).toBe(0);

    const approved = await api.request(`/api/v1/posts/${draft.id}/approve`, {
      method: 'POST',
      json: { revision: draft.revision }
    });
    expect(approved.status).toBe(200);
    const retry = await schedule({ postId: draft.id, revision: draft.revision + 1 }, 'draft-key');
    expect(retry.status).toBe(202);
  });

  it('answers 409 STALE_REVISION when the revision is not the approved one', async () => {
    await expectError(await schedule({ revision: postRevision - 1 }), 409, 'CONFLICT', {
      reason: 'STALE_REVISION'
    });
    await expectError(await schedule({ revision: postRevision + 1 }), 409, 'CONFLICT', {
      reason: 'STALE_REVISION'
    });
    expect(await count('publications')).toBe(0);
  });

  it('answers 409 DESTINATION_DISABLED, but keeps publications scheduled before the destination was disabled', async () => {
    const existing = await scheduleOk();
    const patched = await api.request(`/api/v1/destinations/${destinationId}`, {
      method: 'PATCH',
      json: { revision: 0, enabled: false }
    });
    expect(patched.status).toBe(200);

    await expectError(await schedule({}, 'second'), 409, 'CONFLICT', { reason: 'DESTINATION_DISABLED' });

    expect((await jobOf(existing.id)).status).toBe('pending');
    expect(await count('publications')).toBe(1);
  });

  it('allows the same post to be scheduled again as a new intent', async () => {
    const first = await scheduleOk();
    const second = await scheduleOk();

    expect(second.id).not.toBe(first.id);
    expect(await count('jobs')).toBe(2);
  });

  it.each([
    ['a missing post id', { postId: undefined }],
    ['a malformed post id', { postId: 'abc' }],
    ['an unknown time zone', { timezone: 'Mars/Olympus' }],
    ['a fixed-offset time zone', { timezone: '+05:00' }],
    ['an offset datetime', { scheduledAt: '2027-01-15T08:10:00+03:00' }],
    ['a non-datetime', { scheduledAt: 'tomorrow' }],
    ['a negative revision', { revision: -1 }],
    ['an unknown field', { status: 'sent' }]
  ])('answers 400 for %s without burning the key', async (_name, overrides) => {
    await expectError(await schedule(overrides, 'bad'), 400, 'VALIDATION_ERROR');

    expect(await count('publications')).toBe(0);
    expect(await count('idempotency_keys', "key = 'bad'")).toBe(0);
  });

  it('answers 400 without an Idempotency-Key and 413 for a body over 8 KB', async () => {
    await expectError(await schedule({}, null), 400, 'VALIDATION_ERROR');
    await expectError(await schedule({ timezone: 'z'.repeat(9_000) }), 413, 'VALIDATION_ERROR');
  });
});

describe('GET /api/v1/publications/{id}', () => {
  it('returns the publication or 404', async () => {
    const created = await scheduleOk();

    const response = await api.request(`/api/v1/publications/${created.id}`);

    expect(response.status).toBe(200);
    expect(publicationSchema.parse(await response.json())).toEqual(created);
    await expectError(await api.request(`/api/v1/publications/${crypto.randomUUID()}`), 404, 'NOT_FOUND');
    await expectError(await api.request('/api/v1/publications/nope'), 404, 'NOT_FOUND');
  });

  it('projects scheduled into queued exactly when run_at is reached, with no write in between', async () => {
    const created = await scheduleOk({ scheduledAt: iso(START + MINUTE) });
    const rowVersion = (await jobOf(created.id)).run_at;

    expect((await get(created.id)).status).toBe('scheduled');
    api.clock.set(START + MINUTE - 1);
    expect((await get(created.id)).status).toBe('scheduled');
    api.clock.set(START + MINUTE);
    expect((await get(created.id)).status).toBe('queued');
    api.clock.set(START + DAY);
    expect((await get(created.id)).status).toBe('queued');
    expect((await jobOf(created.id)).run_at).toBe(rowVersion);
  });

  it('projects every job state and reports the message id and error code only when present', async () => {
    const created = await scheduleOk({ scheduledAt: iso(START - MINUTE) });
    const cases: [Parameters<typeof setJob>[1], string][] = [
      [{ status: 'claimed', send_started_at: null }, 'preparing'],
      [{ status: 'claimed', send_started_at: START }, 'sending'],
      [{ status: 'retry_wait', send_started_at: null }, 'retry_wait'],
      [{ status: 'unknown', send_started_at: START }, 'unknown'],
      [{ status: 'cancelled', send_started_at: null }, 'cancelled']
    ];
    for (const [fields, expected] of cases) {
      await setJob(created.id, fields);
      expect((await get(created.id)).status).toBe(expected);
    }

    await setJob(created.id, { status: 'succeeded' });
    await testDb()
      .prepare('UPDATE publications SET external_message_id = ?2 WHERE id = ?1')
      .bind(created.id, '4711')
      .run();
    expect(await get(created.id)).toMatchObject({ status: 'sent', externalMessageId: '4711' });

    await setJob(created.id, { status: 'failed' });
    await testDb()
      .prepare('UPDATE publications SET last_error_code = ?2 WHERE id = ?1')
      .bind(created.id, 'CONTENT_INVALID')
      .run();
    expect(await get(created.id)).toMatchObject({ status: 'failed', lastErrorCode: 'CONTENT_INVALID' });
  });
});

describe('GET /api/v1/publications', () => {
  async function pageThrough(query: string): Promise<PublicationDto[]> {
    const seen: PublicationDto[] = [];
    let cursor: string | null = null;
    do {
      const response: Response = await api.request(
        `/api/v1/publications?limit=2${query}${cursor === null ? '' : `&cursor=${cursor}`}`
      );
      expect(response.status).toBe(200);
      const page = publicationPageSchema.parse(await response.json());
      seen.push(...page.items);
      cursor = page.nextCursor;
    } while (cursor !== null);
    return seen;
  }

  it('lists the latest scheduledAt first and pages through equal timestamps without gaps or repeats', async () => {
    const times = [START + MINUTE, START + 3 * MINUTE, START + 3 * MINUTE, START + 3 * MINUTE, START + 2 * MINUTE];
    const created: PublicationDto[] = [];
    for (const time of times) created.push(await scheduleOk({ scheduledAt: iso(time) }));

    const seen = await pageThrough('');

    expect(seen.map((item) => item.id)).toEqual(
      [...created]
        .sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt) || b.id.localeCompare(a.id))
        .map((item) => item.id)
    );
    expect(new Set(seen.map((item) => item.id)).size).toBe(5);
  });

  it('filters by post, destination and status, alone and combined', async () => {
    const otherPost = await seedApprovedPost(api, 'Other post');
    const otherDestination = await seedDestination(api, { title: 'Group', kind: 'group' });
    const a = await scheduleOk({ scheduledAt: iso(START + 5 * MINUTE) });
    const b = await scheduleOk({
      postId: otherPost.id,
      revision: otherPost.revision,
      scheduledAt: iso(START + 6 * MINUTE)
    });
    const c = await scheduleOk({ destinationId: otherDestination.id, scheduledAt: iso(START + 7 * MINUTE) });
    const d = await scheduleOk({ scheduledAt: iso(START - MINUTE) });
    await cancel(c.id, { revision: 0 });

    const ids = async (query: string) => (await pageThrough(query)).map((item) => item.id);

    expect(await ids(`&postId=${postId}`)).toEqual([c.id, a.id, d.id]);
    expect(await ids(`&postId=${otherPost.id}`)).toEqual([b.id]);
    expect(await ids(`&destinationId=${otherDestination.id}`)).toEqual([c.id]);
    expect(await ids(`&postId=${postId}&destinationId=${destinationId}`)).toEqual([a.id, d.id]);
    expect(await ids('&status=scheduled')).toEqual([b.id, a.id]);
    expect(await ids('&status=queued')).toEqual([d.id]);
    expect(await ids('&status=cancelled')).toEqual([c.id]);
    expect(await ids('&status=sent')).toEqual([]);
    expect(await ids(`&postId=${postId}&status=scheduled`)).toEqual([a.id]);
  });

  it('returns the filtered total and exact per-status counts while status tabs ignore the selected status', async () => {
    const scheduled = await scheduleOk({ scheduledAt: iso(START + 4 * MINUTE) });
    const failed = await scheduleOk({ scheduledAt: iso(START + 3 * MINUTE) });
    const cancelled = await scheduleOk({ scheduledAt: iso(START + 2 * MINUTE) });
    const queued = await scheduleOk({ scheduledAt: iso(START + MINUTE) });
    const preparing = await scheduleOk({ scheduledAt: iso(START + 4 * MINUTE) });
    const sending = await scheduleOk({ scheduledAt: iso(START + 4 * MINUTE) });
    const sent = await scheduleOk({ scheduledAt: iso(START + 4 * MINUTE) });
    const retryWait = await scheduleOk({ scheduledAt: iso(START + 4 * MINUTE) });
    const unknown = await scheduleOk({ scheduledAt: iso(START + 4 * MINUTE) });
    await setJob(failed.id, { status: 'failed' });
    await cancel(cancelled.id, { revision: 0 });
    await setJob(queued.id, { run_at: START - MINUTE });
    await setJob(preparing.id, { status: 'claimed', send_started_at: null });
    await setJob(sending.id, { status: 'claimed', send_started_at: START });
    await setJob(sent.id, { status: 'succeeded' });
    await setJob(retryWait.id, { status: 'retry_wait' });
    await setJob(unknown.id, { status: 'unknown' });
    expect(await jobOf(queued.id)).toMatchObject({ status: 'pending', run_at: START - MINUTE });
    expect(await jobOf(sending.id)).toMatchObject({ status: 'claimed', send_started_at: START });

    const response = await api.request(
      `/api/v1/publications?status=failed&postId=${postId}&q=Patch&from=${encodeURIComponent(iso(START))}&to=${encodeURIComponent(iso(START + 5 * MINUTE))}`
    );
    const page = publicationPageSchema.parse(await response.json());

    expect(page.items.map((item) => item.id)).toEqual([failed.id]);
    expect(page.totalCount).toBe(1);
    expect(page.statusCounts).toEqual({
      scheduled: 1,
      queued: 1,
      preparing: 1,
      sending: 1,
      sent: 1,
      retry_wait: 1,
      failed: 1,
      unknown: 1,
      cancelled: 1
    });
    expect(page.statusCounts.scheduled).toBe(1);
    expect(page.items).not.toContainEqual(expect.objectContaining({ id: scheduled.id }));
  });

  it('returns failed and unknown publications together through the errors group', async () => {
    const failed = await scheduleOk({ scheduledAt: iso(START + 2 * MINUTE) });
    const unknown = await scheduleOk({ scheduledAt: iso(START + MINUTE) });
    await setJob(failed.id, { status: 'failed' });
    await setJob(unknown.id, { status: 'unknown' });

    const response = await api.request('/api/v1/publications?statusGroup=errors');
    const page = publicationPageSchema.parse(await response.json());

    expect(page.items.map((item) => item.id)).toEqual([failed.id, unknown.id]);
    expect(page.totalCount).toBe(2);
    expect(page.statusCounts.failed).toBe(1);
    expect(page.statusCounts.unknown).toBe(1);
  });

  it('pages a status filter through equal timestamps without gaps or repeats', async () => {
    const created: PublicationDto[] = [];
    for (const time of [
      START + MINUTE,
      START + 3 * MINUTE,
      START + 3 * MINUTE,
      START + 3 * MINUTE,
      START + 3 * MINUTE
    ]) {
      created.push(await scheduleOk({ scheduledAt: iso(time) }));
    }
    const [skipped] = created;
    await cancel((skipped as PublicationDto).id, { revision: 0 });

    const seen = await pageThrough('&status=scheduled');

    const expected = created
      .filter((item) => item.id !== skipped?.id)
      .sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt) || b.id.localeCompare(a.id));
    expect(seen.map((item) => item.id)).toEqual(expected.map((item) => item.id));
    expect((await pageThrough('&status=cancelled')).map((item) => item.id)).toEqual([skipped?.id]);
  });

  it('moves a publication from the scheduled filter to the queued filter as time passes', async () => {
    const created = await scheduleOk({ scheduledAt: iso(START + MINUTE) });
    const status = async (value: string) => (await pageThrough(`&status=${value}`)).map((item) => item.id);

    expect(await status('scheduled')).toEqual([created.id]);
    expect(await status('queued')).toEqual([]);
    api.clock.set(START + MINUTE);
    expect(await status('scheduled')).toEqual([]);
    expect(await status('queued')).toEqual([created.id]);
  });

  it('returns an empty page, not an error, when nothing matches', async () => {
    const page = publicationPageSchema.parse(await (await api.request('/api/v1/publications')).json());

    expect(page).toEqual({
      items: [],
      nextCursor: null,
      page: null,
      totalCount: 0,
      statusCounts: {
        scheduled: 0,
        queued: 0,
        preparing: 0,
        sending: 0,
        sent: 0,
        retry_wait: 0,
        failed: 0,
        unknown: 0,
        cancelled: 0
      }
    });
  });

  it.each([
    ['limit 0', 'limit=0'],
    ['limit 101', 'limit=101'],
    ['an unknown status', 'status=done'],
    ['status and a status group together', 'status=failed&statusGroup=errors'],
    ['a malformed post id', 'postId=abc'],
    ['a malformed destination id', 'destinationId=abc'],
    ['an unknown parameter', 'sort=asc'],
    ['a malformed cursor', 'cursor=%2A%2A%2A'],
    ['a cursor of another shape', `cursor=${btoa('1:0b1f6c52-8d3e-4a47-9a35-2f6f0c1d7e90')}`]
  ])('answers 400 for %s', async (_name, query) => {
    await expectError(await api.request(`/api/v1/publications?${query}`), 400, 'VALIDATION_ERROR');
  });

  it('accepts limit 100', async () => {
    expect((await api.request('/api/v1/publications?limit=100')).status).toBe(200);
  });
});

// What an owner action may do to a job in each state (the dispatcher owns claimed, humans own unknown).
const JOB_STATES: [string, Parameters<typeof setJob>[1], boolean][] = [
  ['pending', { status: 'pending' }, true],
  ['retry_wait', { status: 'retry_wait', send_started_at: null }, true],
  ['claimed, not started', { status: 'claimed', lease_until: START + MINUTE, send_started_at: null }, false],
  ['claimed, send started', { status: 'claimed', lease_until: START + MINUTE, send_started_at: START }, false],
  ['claimed with an expired lease', { status: 'claimed', lease_until: START - MINUTE, send_started_at: null }, false],
  ['succeeded', { status: 'succeeded' }, false],
  ['failed', { status: 'failed' }, false],
  ['unknown', { status: 'unknown', send_started_at: START }, false],
  ['cancelled', { status: 'cancelled' }, false]
];

describe('POST /api/v1/publications/{id}/cancel', () => {
  it('cancels a scheduled publication, bumps the revision and writes an audit row', async () => {
    const created = await scheduleOk();
    api.clock.advance(MINUTE);

    const response = await cancel(created.id, { revision: 0 });

    expect(response.status).toBe(200);
    const cancelled = publicationSchema.parse(await response.json());
    expect(cancelled).toMatchObject({
      id: created.id,
      status: 'cancelled',
      revision: 1,
      updatedAt: iso(START + MINUTE),
      scheduledAt: created.scheduledAt
    });
    expect(await jobOf(created.id)).toMatchObject({ status: 'cancelled', lease_until: null });
    const audit = await testDb()
      .prepare("SELECT entity_id, details FROM audit_log WHERE action = 'publication.cancel'")
      .all<{ entity_id: string; details: string }>();
    expect(audit.results.map((row) => [row.entity_id, JSON.parse(row.details)])).toEqual([
      [created.id, { revision: 1 }]
    ]);
  });

  it.each(JOB_STATES)('with the job %s', async (_name, fields, allowed) => {
    const created = await scheduleOk({ scheduledAt: iso(START - MINUTE) });
    await setJob(created.id, fields);
    const jobBefore = await jobOf(created.id);

    const response = await cancel(created.id, { revision: 0 });

    if (allowed) {
      expect(response.status).toBe(200);
      expect((await jobOf(created.id)).status).toBe('cancelled');
      expect((await get(created.id)).revision).toBe(1);
      return;
    }
    await expectError(response, 409, 'CONFLICT', { reason: 'NOT_CANCELLABLE' });
    expect(await jobOf(created.id)).toEqual(jobBefore);
    expect((await get(created.id)).revision).toBe(0);
    expect(await count('audit_log', "action = 'publication.cancel'")).toBe(0);
  });

  it('answers 409 STALE_REVISION for an old revision and leaves job and publication untouched', async () => {
    const created = await scheduleOk();
    await reschedule(created.id, { revision: 0, scheduledAt: iso(START + 20 * MINUTE), timezone: 'UTC' });

    await expectError(await cancel(created.id, { revision: 0 }), 409, 'CONFLICT', { reason: 'STALE_REVISION' });

    expect((await jobOf(created.id)).status).toBe('pending');
    expect((await get(created.id)).revision).toBe(1);
    expect(await count('audit_log', "action = 'publication.cancel'")).toBe(0);
  });

  it('answers NOT_CANCELLABLE to a second cancel, whatever revision it holds', async () => {
    const created = await scheduleOk();
    expect((await cancel(created.id, { revision: 0 })).status).toBe(200);

    await expectError(await cancel(created.id, { revision: 0 }), 409, 'CONFLICT', { reason: 'NOT_CANCELLABLE' });
    await expectError(await cancel(created.id, { revision: 1 }), 409, 'CONFLICT', { reason: 'NOT_CANCELLABLE' });
    expect((await get(created.id)).revision).toBe(1);
  });

  it('answers 404 for an unknown or malformed id', async () => {
    await expectError(await cancel(crypto.randomUUID(), { revision: 0 }), 404, 'NOT_FOUND');
    await expectError(await cancel('nope', { revision: 0 }), 404, 'NOT_FOUND');
  });

  it.each([
    ['a missing revision', {}],
    ['a negative revision', { revision: -1 }],
    ['an unknown field', { revision: 0, force: true }]
  ])('answers 400 for %s', async (_name, json) => {
    const created = await scheduleOk();

    await expectError(await cancel(created.id, json), 400, 'VALIDATION_ERROR');
    expect((await jobOf(created.id)).status).toBe('pending');
  });

  describe('against the dispatcher claim (BACKEND §5 SQL)', () => {
    it('refuses to cancel once the claim has won', async () => {
      const created = await scheduleOk({ scheduledAt: iso(START) });
      const job = await jobOf(created.id);

      expect(await claimJob(job.id, START, START + MINUTE)).toBe(1);
      const response = await cancel(created.id, { revision: 0 });

      await expectError(response, 409, 'CONFLICT', { reason: 'NOT_CANCELLABLE' });
      expect(await jobOf(created.id)).toMatchObject({ status: 'claimed', attempts: 1 });
      expect((await get(created.id)).status).toBe('preparing');
    });

    it('makes the claim lose once the cancel has won', async () => {
      const created = await scheduleOk({ scheduledAt: iso(START) });
      const job = await jobOf(created.id);

      expect((await cancel(created.id, { revision: 0 })).status).toBe(200);

      expect(await claimJob(job.id, START, START + MINUTE)).toBe(0);
      expect(await jobOf(created.id)).toMatchObject({ status: 'cancelled', attempts: 0 });
    });

    it('never lets a cancel and a claim both succeed when they race', async () => {
      const outcomes = { cancelWon: 0, claimWon: 0 };
      for (let round = 0; round < 12; round += 1) {
        const created = await scheduleOk({ scheduledAt: iso(START) });
        const job = await jobOf(created.id);

        const [response, claimed] = await Promise.all([
          cancel(created.id, { revision: 0 }),
          claimJob(job.id, START, START + MINUTE)
        ]);

        const after = await jobOf(created.id);
        if (response.status === 200) {
          outcomes.cancelWon += 1;
          expect(claimed).toBe(0);
          expect(after.status).toBe('cancelled');
        } else {
          outcomes.claimWon += 1;
          await expectError(response, 409, 'CONFLICT', { reason: 'NOT_CANCELLABLE' });
          expect(claimed).toBe(1);
          expect(after.status).toBe('claimed');
          expect((await get(created.id)).revision).toBe(0);
        }
      }
      expect(outcomes.cancelWon + outcomes.claimWon).toBe(12);
    });

    it('never lets a reschedule and a claim both succeed when they race', async () => {
      for (let round = 0; round < 12; round += 1) {
        const created = await scheduleOk({ scheduledAt: iso(START) });
        const job = await jobOf(created.id);

        const [response, claimed] = await Promise.all([
          reschedule(created.id, { revision: 0, scheduledAt: iso(START + DAY), timezone: 'UTC' }),
          claimJob(job.id, START, START + MINUTE)
        ]);

        const after = await jobOf(created.id);
        if (response.status === 200) {
          expect(claimed).toBe(0);
          expect(after).toMatchObject({ status: 'pending', run_at: START + DAY });
        } else {
          await expectError(response, 409, 'CONFLICT', { reason: 'NOT_RESCHEDULABLE' });
          expect(claimed).toBe(1);
          expect(after).toMatchObject({ status: 'claimed', run_at: START });
          expect((await get(created.id)).revision).toBe(0);
        }
      }
    });
  });
});

describe('POST /api/v1/publications/{id}/reschedule', () => {
  it('moves a scheduled publication, bumps the revision and writes an audit row', async () => {
    const created = await scheduleOk();
    api.clock.advance(MINUTE);

    const response = await reschedule(created.id, {
      revision: 0,
      scheduledAt: iso(START + 3 * DAY),
      timezone: 'Asia/Tokyo'
    });

    expect(response.status).toBe(200);
    const moved = publicationSchema.parse(await response.json());
    expect(moved).toMatchObject({
      id: created.id,
      status: 'scheduled',
      scheduledAt: iso(START + 3 * DAY),
      timezone: 'Asia/Tokyo',
      revision: 1,
      updatedAt: iso(START + MINUTE)
    });
    expect(await jobOf(created.id)).toMatchObject({ status: 'pending', run_at: START + 3 * DAY });
    const audit = await testDb()
      .prepare("SELECT details FROM audit_log WHERE action = 'publication.reschedule'")
      .all<{ details: string }>();
    expect(audit.results.map((row) => JSON.parse(row.details))).toEqual([{ revision: 1 }]);
  });

  it('turns a publication waiting for a retry into a scheduled one and keeps the attempt count', async () => {
    const created = await scheduleOk({ scheduledAt: iso(START - MINUTE) });
    await testDb()
      .prepare("UPDATE jobs SET status = 'retry_wait', attempts = 2, run_at = ?2 WHERE publication_id = ?1")
      .bind(created.id, START + 30_000)
      .run();

    const response = await reschedule(created.id, { revision: 0, scheduledAt: iso(START + DAY), timezone: 'UTC' });

    expect(response.status).toBe(200);
    expect(publicationSchema.parse(await response.json()).status).toBe('scheduled');
    expect(await jobOf(created.id)).toMatchObject({ status: 'pending', run_at: START + DAY, attempts: 2 });
  });

  it('stores a time zone alias under its canonical name and refuses a fixed offset', async () => {
    const created = await scheduleOk();

    const moved = publicationSchema.parse(
      await (
        await reschedule(created.id, { revision: 0, scheduledAt: iso(START + DAY), timezone: 'asia/tokyo' })
      ).json()
    );

    expect(moved.timezone).toBe('Asia/Tokyo');
    await expectError(
      await reschedule(created.id, { revision: 1, scheduledAt: iso(START + DAY), timezone: '+05:00' }),
      400,
      'VALIDATION_ERROR'
    );
  });

  it('sends "now" when the new time is in the grace window', async () => {
    const created = await scheduleOk();

    const moved = publicationSchema.parse(
      await (await reschedule(created.id, { revision: 0, scheduledAt: iso(START - MINUTE), timezone: 'UTC' })).json()
    );

    expect(moved.status).toBe('queued');
  });

  it.each(JOB_STATES)('with the job %s', async (_name, fields, allowed) => {
    const created = await scheduleOk({ scheduledAt: iso(START - MINUTE) });
    await setJob(created.id, fields);
    const jobBefore = await jobOf(created.id);

    const response = await reschedule(created.id, { revision: 0, scheduledAt: iso(START + DAY), timezone: 'UTC' });

    if (allowed) {
      expect(response.status).toBe(200);
      expect(await jobOf(created.id)).toMatchObject({ status: 'pending', run_at: START + DAY });
      return;
    }
    await expectError(response, 409, 'CONFLICT', { reason: 'NOT_RESCHEDULABLE' });
    expect(await jobOf(created.id)).toEqual(jobBefore);
    expect(await get(created.id)).toMatchObject({ revision: 0, scheduledAt: iso(START - MINUTE) });
    expect(await count('audit_log', "action = 'publication.reschedule'")).toBe(0);
  });

  it('answers 409 STALE_REVISION and changes nothing', async () => {
    const created = await scheduleOk();

    await expectError(
      await reschedule(created.id, { revision: 3, scheduledAt: iso(START + DAY), timezone: 'UTC' }),
      409,
      'CONFLICT',
      { reason: 'STALE_REVISION' }
    );

    expect(await get(created.id)).toMatchObject({ revision: 0, timezone: 'Europe/Moscow' });
    expect((await jobOf(created.id)).run_at).toBe(START + 10 * MINUTE);
  });

  it('answers 400 SCHEDULE_OUT_OF_RANGE and changes nothing', async () => {
    const created = await scheduleOk();

    await expectError(
      await reschedule(created.id, { revision: 0, scheduledAt: iso(START + 367 * DAY), timezone: 'UTC' }),
      400,
      'VALIDATION_ERROR',
      { reason: 'SCHEDULE_OUT_OF_RANGE' }
    );
    await expectError(
      await reschedule(created.id, { revision: 0, scheduledAt: iso(START - 6 * MINUTE), timezone: 'UTC' }),
      400,
      'VALIDATION_ERROR',
      { reason: 'SCHEDULE_OUT_OF_RANGE' }
    );

    expect(await get(created.id)).toMatchObject({ revision: 0 });
  });

  it('answers 404 for an unknown or malformed id', async () => {
    const body = { revision: 0, scheduledAt: iso(START + DAY), timezone: 'UTC' };
    await expectError(await reschedule(crypto.randomUUID(), body), 404, 'NOT_FOUND');
    await expectError(await reschedule('nope', body), 404, 'NOT_FOUND');
  });

  it.each([
    ['a missing time zone', { revision: 0, scheduledAt: '2027-01-16T00:00:00Z' }],
    ['an unknown time zone', { revision: 0, scheduledAt: '2027-01-16T00:00:00Z', timezone: 'Mars/Olympus' }],
    ['an unknown field', { revision: 0, scheduledAt: '2027-01-16T00:00:00Z', timezone: 'UTC', status: 'sent' }]
  ])('answers 400 for %s', async (_name, json) => {
    const created = await scheduleOk();

    await expectError(await reschedule(created.id, json), 400, 'VALIDATION_ERROR');
  });

  it('lets exactly one of two concurrent reschedules of the same revision win, even in the same millisecond', async () => {
    const created = await scheduleOk();

    const responses = await Promise.all([
      reschedule(created.id, { revision: 0, scheduledAt: iso(START + 2 * DAY), timezone: 'Asia/Tokyo' }),
      reschedule(created.id, { revision: 0, scheduledAt: iso(START + 3 * DAY), timezone: 'Asia/Seoul' })
    ]);

    const [winner] = responses.filter((response) => response.status === 200);
    const losers = responses.filter((response) => response.status !== 200);
    expect(winner).toBeDefined();
    expect(losers).toHaveLength(1);
    await expectError(losers[0] as Response, 409, 'CONFLICT', { reason: 'STALE_REVISION' });
    const won = publicationSchema.parse(await (winner as Response).json());
    expect(won.revision).toBe(1);
    expect(await get(created.id)).toMatchObject({
      revision: 1,
      scheduledAt: won.scheduledAt,
      timezone: won.timezone
    });
    expect((await jobOf(created.id)).run_at).toBe(Date.parse(won.scheduledAt));
    expect(await count('audit_log', "action = 'publication.reschedule'")).toBe(1);
  });

  it('keeps job and publication consistent when a reschedule and a cancel race on the same revision', async () => {
    const created = await scheduleOk();

    const [moved, cancelled] = await Promise.all([
      reschedule(created.id, { revision: 0, scheduledAt: iso(START + 2 * DAY), timezone: 'UTC' }),
      cancel(created.id, { revision: 0 })
    ]);

    expect([moved.status, cancelled.status].filter((status) => status === 200)).toHaveLength(1);
    const job = await jobOf(created.id);
    const publication = await get(created.id);
    expect(publication.revision).toBe(1);
    if (moved.status === 200) {
      await expectError(cancelled, 409, 'CONFLICT', { reason: 'STALE_REVISION' });
      expect(job).toMatchObject({ status: 'pending', run_at: START + 2 * DAY });
      expect(publication.scheduledAt).toBe(iso(START + 2 * DAY));
    } else {
      await expectError(moved, 409, 'CONFLICT', { reason: 'NOT_RESCHEDULABLE' });
      expect(job).toMatchObject({ status: 'cancelled', run_at: START + 10 * MINUTE });
      expect(publication.scheduledAt).toBe(iso(START + 10 * MINUTE));
    }
  });
});

describe('publication routes are owner-only', () => {
  const id = crypto.randomUUID();
  const routes: [string, string][] = [
    ['POST', '/api/v1/publications'],
    ['GET', '/api/v1/publications'],
    ['GET', `/api/v1/publications/${id}`],
    ['POST', `/api/v1/publications/${id}/reschedule`],
    ['POST', `/api/v1/publications/${id}/cancel`],
    ['POST', `/api/v1/publications/${id}/resolve-unknown`]
  ];

  it.each(routes)('%s %s answers 401 without a token and 403 for another user', async (method, path) => {
    await seedSession({ token: 'stranger-token-0000000000000000000000000', telegramId: '777' });
    const before = [await count('publications'), await count('jobs'), await count('audit_log')];

    await expectError(await api.request(path, { method, token: null }), 401, 'UNAUTHORIZED');
    await expectError(
      await api.request(path, { method, token: 'stranger-token-0000000000000000000000000' }),
      403,
      'FORBIDDEN'
    );
    expect([await count('publications'), await count('jobs'), await count('audit_log')]).toEqual(before);
  });
});

describe('seedPublication helper', () => {
  it('creates through the public API', async () => {
    const created = await seedPublication(api, {
      postId,
      revision: postRevision,
      destinationId,
      scheduledAt: iso(START + MINUTE)
    });

    expect(created.status).toBe('scheduled');
  });
});

describe('owner notice when a publication is scheduled or moved', () => {
  const ORIGIN = 'http://localhost';

  it('sends exactly one message with the post, the channel, the time and the deep link button', async () => {
    const scheduledAt = START + 3 * 60 * MINUTE;
    const publication = await scheduleOk({ scheduledAt: iso(scheduledAt), timezone: 'Europe/Moscow' });
    await api.settle();

    expect(api.ownerMessages).toHaveLength(1);
    const [message] = api.ownerMessages;
    expect(message?.chatId).toBe(OWNER_ID);
    expect(message?.html).toContain('<b>Публикация запланирована</b>');
    expect(message?.html).toContain('Пост: Patch 7.40');
    expect(message?.html).toContain('Канал: Main channel');
    expect(message?.html).toContain(`(Europe/Moscow)`);
    expect(message?.button).toEqual({ text: 'Подробнее', url: `${ORIGIN}/publications?id=${publication.id}` });
  });

  it('escapes a post title that looks like markup', async () => {
    const post = await seedApprovedPost(api, '<b>Boom</b> & <a href="x">link</a>');
    await scheduleOk({ postId: post.id, revision: post.revision });
    await api.settle();

    const html = api.ownerMessages[0]?.html ?? '';
    expect(html).toContain('Пост: &lt;b&gt;Boom&lt;/b&gt; &amp; &lt;a href=&quot;x&quot;&gt;link&lt;/a&gt;');
    expect(html.match(/<[^>]+>/g)).toEqual(['<b>', '</b>']);
  });

  it('does not send a second message for an idempotent replay', async () => {
    const first = await schedule({}, 'same-key');
    const replay = await schedule({}, 'same-key');
    await api.settle();

    expect(first.status).toBe(202);
    expect(replay.status).toBe(202);
    expect(api.ownerMessages).toHaveLength(1);
    expect(await count('publications')).toBe(1);
  });

  it('sends nothing for a refused request', async () => {
    const response = await schedule({ scheduledAt: iso(START + 400 * DAY) });
    await api.settle();

    expect(response.status).toBe(400);
    expect(api.ownerMessages).toEqual([]);
  });

  it('sends nothing for a publication that is due now', async () => {
    const publication = await scheduleOk({ scheduledAt: iso(START) });
    await api.settle();

    expect(publication.status).toBe('queued');
    expect(api.ownerMessages).toEqual([]);
  });

  it('still answers 202 and stores everything when Telegram refuses the notice', async () => {
    api = createApi({
      clock: fakeClock(),
      ownerMessenger: fakeOwnerMessenger({ fail: () => new Error('chat not found') })
    });
    const response = await schedule();
    await api.settle();

    expect(response.status).toBe(202);
    const publication = publicationSchema.parse(await response.json());
    expect(await jobOf(publication.id)).toMatchObject({ status: 'pending', attempts: 0 });
  });

  it('answers 202 without a bot token and sends nothing', async () => {
    api = createApi({ clock: fakeClock(), botToken: null });
    const response = await schedule();
    await api.settle();

    expect(response.status).toBe(202);
    expect(await count('publications')).toBe(1);
  });

  it('does not touch the job state while announcing', async () => {
    const publication = await scheduleOk();
    const before = await jobOf(publication.id);
    await api.settle();

    expect(await jobOf(publication.id)).toEqual(before);
    expect(await count('job_attempts')).toBe(0);
  });

  it('announces a reschedule with the new time and the same button', async () => {
    const publication = await scheduleOk();
    await api.settle();
    api.ownerMessages.length = 0;

    const response = await reschedule(publication.id, {
      revision: 0,
      scheduledAt: iso(START + 5 * 60 * MINUTE),
      timezone: 'Asia/Tokyo'
    });
    await api.settle();

    expect(response.status).toBe(200);
    expect(api.ownerMessages).toHaveLength(1);
    const [message] = api.ownerMessages;
    expect(message?.html).toContain('<b>Публикация перенесена</b>');
    expect(message?.html).toContain('(Asia/Tokyo)');
    expect(message?.button.url).toBe(`${ORIGIN}/publications?id=${publication.id}`);
  });

  it('sends nothing when a reschedule is refused or moves the publication to now', async () => {
    const publication = await scheduleOk();
    await api.settle();
    api.ownerMessages.length = 0;

    const stale = await reschedule(publication.id, {
      revision: 9,
      scheduledAt: iso(START + 5 * 60 * MINUTE),
      timezone: 'UTC'
    });
    const now = await reschedule(publication.id, { revision: 0, scheduledAt: iso(START), timezone: 'UTC' });
    await api.settle();

    expect(stale.status).toBe(409);
    expect(now.status).toBe(200);
    expect(api.ownerMessages).toEqual([]);
  });
});

describe('GET /api/v1/publications page numbers', () => {
  it('serves page slices in the cursor order and reports totalCount beyond the last page', async () => {
    for (let i = 0; i < 5; i++) await scheduleOk({ scheduledAt: iso(START + (10 + i) * MINUTE) });
    const read = async (query: string) => {
      const response = await api.request(`/api/v1/publications?${query}`);
      expect(response.status).toBe(200);
      return publicationPageSchema.parse(await response.json());
    };

    const everything = await read('limit=100');
    const second = await read('page=2&limit=2');
    const beyond = await read('page=7&limit=2');

    expect(second.items.map((item) => item.id)).toEqual(everything.items.slice(2, 4).map((item) => item.id));
    expect(second).toMatchObject({ page: 2, nextCursor: null, totalCount: 5 });
    expect(beyond).toMatchObject({ items: [], page: 7, totalCount: 5 });
    expect((await api.request('/api/v1/publications?page=2&cursor=abc')).status).toBe(400);
  });
});
