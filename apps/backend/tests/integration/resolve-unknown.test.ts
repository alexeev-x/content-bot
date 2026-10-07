import { publicationSchema } from '@alexeev/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { testDb } from '../helpers/db';
import { attemptsOf, fakeTransport, incidentsOf, makeTick, publicationOf, SENT, seedDueJob } from '../helpers/dispatch';
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
import { postRow } from '../helpers/lifecycle';
import { count, jobOf } from '../helpers/publishing';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const iso = (ms: number) => new Date(ms).toISOString();
const UNCONFIRMED = { kind: 'unknown', reason: 'timeout' } as const;

let clock: FakeClock;
let api: Api;

beforeEach(async () => {
  await resetDb();
  await seedSession({ token: OWNER_TOKEN, expiresAt: START + 400 * DAY });
  clock = fakeClock();
  api = createApi({ clock });
});

const tick = (transport = fakeTransport(SENT)) => makeTick({ clock, transport }).run();
const resolve = (id: string, json: unknown) =>
  api.request(`/api/v1/publications/${id}/resolve-unknown`, { method: 'POST', json });
const get = async (id: string) =>
  publicationSchema.parse(await (await api.request(`/api/v1/publications/${id}`)).json());

// A real unconfirmed send: a due job, a tick whose Telegram call is ambiguous. The job ends in
// `unknown` with its incident, exactly as production produces it. The clock moves on a minute.
async function seedUnknown() {
  const seeded = await seedDueJob(api);
  const transport = fakeTransport(UNCONFIRMED);
  await tick(transport);
  expect(await jobOf(seeded.publicationId)).toMatchObject({ status: 'unknown', attempts: 1 });
  clock.advance(MINUTE);
  return { ...seeded, transport };
}

const auditOf = async (id: string) =>
  (
    await testDb()
      .prepare(
        "SELECT actor_telegram_id, details FROM audit_log WHERE action = 'publication.resolve_unknown' AND entity_id = ?1"
      )
      .bind(id)
      .all<{ actor_telegram_id: string; details: string }>()
  ).results;

describe('POST /api/v1/publications/{id}/resolve-unknown: sent', () => {
  it('records the message id, finishes the job as succeeded, closes the incident and audits it', async () => {
    const { publicationId, jobId } = await seedUnknown();
    const before = await jobOf(publicationId);

    const response = await resolve(publicationId, { outcome: 'sent', revision: 0, externalMessageId: '9001' });

    expect(response.status).toBe(200);
    const body = publicationSchema.parse(await response.json());
    expect(body).toMatchObject({
      id: publicationId,
      status: 'sent',
      externalMessageId: '9001',
      revision: 1,
      updatedAt: iso(clock.now())
    });
    expect(body.lastErrorCode).toBeUndefined();
    expect(await jobOf(publicationId)).toMatchObject({
      status: 'succeeded',
      lease_until: null,
      attempts: 1,
      send_started_at: before.send_started_at
    });
    expect(await publicationOf(publicationId)).toEqual({ external_message_id: '9001', last_error_code: null });
    const incidents = await incidentsOf(jobId);
    expect(incidents).toHaveLength(1);
    expect(incidents[0]).toMatchObject({ kind: 'publish_unknown', resolved_at: clock.now() });
    const audit = await auditOf(publicationId);
    expect(audit.map((row) => [row.actor_telegram_id, JSON.parse(row.details)])).toEqual([
      ['4242', { revision: 1, outcome: 'sent', externalMessageId: '9001' }]
    ]);
    expect(await attemptsOf(jobId)).toMatchObject([{ attempt: 1, outcome: 'unknown' }]);
  });

  it('never sends again, and the next tick archives the post like after a normal send', async () => {
    const { publicationId, postId, transport } = await seedUnknown();
    expect((await postRow(postId))?.archived_at).toBeNull();
    await resolve(publicationId, { outcome: 'sent', revision: 0, externalMessageId: '9001' });

    clock.advance(MINUTE);
    await tick(transport);
    expect((await postRow(postId))?.archived_at).toBe(clock.now());

    for (let step = 0; step < 3; step += 1) {
      clock.advance(DAY);
      await tick(transport);
    }

    expect(transport.calls).toHaveLength(1);
    expect(await jobOf(publicationId)).toMatchObject({ status: 'succeeded', attempts: 1 });
  });
});

describe('POST /api/v1/publications/{id}/resolve-unknown: resend', () => {
  it('makes the job pending again at the new time, and a later tick sends it once', async () => {
    const { publicationId, jobId, transport } = await seedUnknown();
    const at = clock.now() + 10 * MINUTE;

    const response = await resolve(publicationId, {
      outcome: 'resend',
      revision: 0,
      scheduledAt: iso(at),
      timezone: 'Asia/Tokyo'
    });

    expect(response.status).toBe(200);
    expect(publicationSchema.parse(await response.json())).toMatchObject({
      status: 'scheduled',
      scheduledAt: iso(at),
      timezone: 'Asia/Tokyo',
      revision: 1
    });
    expect(await jobOf(publicationId)).toMatchObject({
      status: 'pending',
      run_at: at,
      lease_until: null,
      send_started_at: null,
      attempts: 1
    });
    expect(await publicationOf(publicationId)).toEqual({ external_message_id: null, last_error_code: null });
    expect((await incidentsOf(jobId))[0]?.resolved_at).toBe(clock.now());
    expect(JSON.parse((await auditOf(publicationId))[0]?.details ?? '{}')).toEqual({
      revision: 1,
      outcome: 'resend',
      scheduledAt: at,
      timezone: 'Asia/Tokyo'
    });

    // Not due yet: the endpoint sent nothing and the tick leaves it alone.
    await tick(transport);
    expect(transport.calls).toHaveLength(1);

    clock.set(at);
    const resent = fakeTransport({ kind: 'sent', externalMessageId: '5150' });
    await tick(resent);

    expect(resent.calls).toHaveLength(1);
    expect(await jobOf(publicationId)).toMatchObject({ status: 'succeeded', attempts: 2 });
    expect((await attemptsOf(jobId)).map((row) => [row.attempt, row.outcome])).toEqual([
      [1, 'unknown'],
      [2, 'sent']
    ]);
    expect((await get(publicationId)).externalMessageId).toBe('5150');

    clock.advance(DAY);
    await tick(resent);
    expect(resent.calls).toHaveLength(1);
  });

  it('treats a time up to 5 minutes back as "now": queued, and the next tick sends it', async () => {
    const { publicationId } = await seedUnknown();
    const at = clock.now() - 5 * MINUTE;

    const response = await resolve(publicationId, {
      outcome: 'resend',
      revision: 0,
      scheduledAt: iso(at),
      timezone: 'UTC'
    });

    expect(publicationSchema.parse(await response.json()).status).toBe('queued');
    const resent = fakeTransport(SENT);
    await tick(resent);
    expect(resent.calls).toHaveLength(1);
    expect((await jobOf(publicationId)).status).toBe('succeeded');
  });

  it('counts the earlier attempts: an unknown after the last allowed attempt cannot hide a second failure', async () => {
    const { publicationId } = await seedUnknown();
    await testDb().prepare('UPDATE jobs SET attempts = 5 WHERE publication_id = ?1').bind(publicationId).run();

    await resolve(publicationId, {
      outcome: 'resend',
      revision: 0,
      scheduledAt: iso(clock.now()),
      timezone: 'UTC'
    });
    await tick(fakeTransport({ kind: 'rate_limited', retryAfterSec: 1 }));

    expect(await jobOf(publicationId)).toMatchObject({ status: 'failed', attempts: 6 });
    expect((await publicationOf(publicationId)).last_error_code).toBe('RETRIES_EXHAUSTED');
  });

  it('answers 400 SCHEDULE_OUT_OF_RANGE outside the window and changes nothing', async () => {
    const { publicationId, jobId } = await seedUnknown();
    const jobBefore = await jobOf(publicationId);

    for (const at of [clock.now() - 5 * MINUTE - 1, clock.now() + 366 * DAY + 1]) {
      await expectError(
        await resolve(publicationId, { outcome: 'resend', revision: 0, scheduledAt: iso(at), timezone: 'UTC' }),
        400,
        'VALIDATION_ERROR',
        { reason: 'SCHEDULE_OUT_OF_RANGE' }
      );
    }

    expect(await jobOf(publicationId)).toEqual(jobBefore);
    expect((await get(publicationId)).revision).toBe(0);
    expect((await incidentsOf(jobId))[0]?.resolved_at).toBeNull();
    expect(await auditOf(publicationId)).toHaveLength(0);
  });
});

describe('POST /api/v1/publications/{id}/resolve-unknown: cancel', () => {
  it('cancels for good, closes the incident, and no tick sends it', async () => {
    const { publicationId, jobId, transport } = await seedUnknown();

    const response = await resolve(publicationId, { outcome: 'cancel', revision: 0 });

    expect(response.status).toBe(200);
    expect(publicationSchema.parse(await response.json())).toMatchObject({ status: 'cancelled', revision: 1 });
    expect(await jobOf(publicationId)).toMatchObject({ status: 'cancelled', lease_until: null });
    expect((await incidentsOf(jobId))[0]?.resolved_at).toBe(clock.now());
    expect(JSON.parse((await auditOf(publicationId))[0]?.details ?? '{}')).toEqual({ revision: 1, outcome: 'cancel' });

    for (let step = 0; step < 3; step += 1) {
      clock.advance(DAY);
      await tick(transport);
    }
    expect(transport.calls).toHaveLength(1);
    expect((await jobOf(publicationId)).status).toBe('cancelled');
  });
});

describe('resolve-unknown refusals', () => {
  it('only touches the incidents of its own job', async () => {
    const first = await seedUnknown();
    const second = await seedUnknown();

    await resolve(first.publicationId, { outcome: 'cancel', revision: 0 });

    expect((await incidentsOf(first.jobId))[0]?.resolved_at).not.toBeNull();
    expect((await incidentsOf(second.jobId))[0]?.resolved_at).toBeNull();
    expect((await jobOf(second.publicationId)).status).toBe('unknown');
  });

  it('answers 409 STALE_REVISION for another revision and changes nothing', async () => {
    const { publicationId, jobId } = await seedUnknown();
    const jobBefore = await jobOf(publicationId);

    await expectError(
      await resolve(publicationId, { outcome: 'sent', revision: 3, externalMessageId: '9001' }),
      409,
      'CONFLICT',
      { reason: 'STALE_REVISION' }
    );

    expect(await jobOf(publicationId)).toEqual(jobBefore);
    expect(await get(publicationId)).toMatchObject({ revision: 0, status: 'unknown' });
    expect(await publicationOf(publicationId)).toEqual({
      external_message_id: null,
      last_error_code: 'SEND_UNCONFIRMED'
    });
    expect((await incidentsOf(jobId))[0]?.resolved_at).toBeNull();
    expect(await auditOf(publicationId)).toHaveLength(0);
  });

  const OTHER_STATES: [string, string][] = [
    ['pending', "status = 'pending', send_started_at = NULL"],
    ['retry_wait', "status = 'retry_wait', send_started_at = NULL"],
    ['claimed', "status = 'claimed', lease_until = 9999999999999"],
    ['succeeded', "status = 'succeeded'"],
    ['failed', "status = 'failed'"],
    ['cancelled', "status = 'cancelled'"]
  ];

  it.each(OTHER_STATES)(
    'answers 409 NOT_UNKNOWN for a job that is %s, before looking at the revision',
    async (_n, set) => {
      const { publicationId, jobId } = await seedUnknown();
      await testDb().prepare(`UPDATE jobs SET ${set} WHERE publication_id = ?1`).bind(publicationId).run();
      const jobBefore = await jobOf(publicationId);

      for (const revision of [0, 7]) {
        await expectError(await resolve(publicationId, { outcome: 'cancel', revision }), 409, 'CONFLICT', {
          reason: 'NOT_UNKNOWN'
        });
      }

      expect(await jobOf(publicationId)).toEqual(jobBefore);
      expect((await get(publicationId)).revision).toBe(0);
      expect((await incidentsOf(jobId))[0]?.resolved_at).toBeNull();
      expect(await count('audit_log', "action = 'publication.resolve_unknown'")).toBe(0);
    }
  );

  it('answers 404 for an unknown or malformed id', async () => {
    const body = { outcome: 'cancel', revision: 0 };
    await expectError(await resolve(crypto.randomUUID(), body), 404, 'NOT_FOUND');
    await expectError(await resolve('not-a-uuid', body), 404, 'NOT_FOUND');
    expect(await count('audit_log', "action = 'publication.resolve_unknown'")).toBe(0);
  });

  it.each([
    ['a message id that is not a number', { outcome: 'sent', revision: 0, externalMessageId: 'abc' }],
    ['a message id with a leading zero', { outcome: 'sent', revision: 0, externalMessageId: '0123' }],
    ['a message id of 17 digits', { outcome: 'sent', revision: 0, externalMessageId: '12345678901234567' }],
    ['sent without a message id', { outcome: 'sent', revision: 0 }],
    ['resend without a time', { outcome: 'resend', revision: 0, timezone: 'UTC' }],
    [
      'resend with a fixed offset zone',
      { outcome: 'resend', revision: 0, scheduledAt: iso(START), timezone: '+03:00' }
    ],
    ['an unknown outcome', { outcome: 'retry', revision: 0 }],
    ['an extra field', { outcome: 'cancel', revision: 0, note: 'x' }],
    ['a negative revision', { outcome: 'cancel', revision: -1 }]
  ])('answers 400 for %s and changes nothing', async (_name, body) => {
    const { publicationId } = await seedUnknown();

    await expectError(await resolve(publicationId, body), 400, 'VALIDATION_ERROR');

    expect(await get(publicationId)).toMatchObject({ revision: 0, status: 'unknown' });
  });

  it('answers 413 for a body over 8 KB', async () => {
    const { publicationId } = await seedUnknown();

    const response = await resolve(publicationId, { outcome: 'cancel', revision: 0, note: 'x'.repeat(9 * 1024) });

    expect(response.status).toBe(413);
    expect((await get(publicationId)).status).toBe('unknown');
  });
});

describe('resolve-unknown is applied once', () => {
  it('answers the second press NOT_UNKNOWN and keeps the first answer', async () => {
    const { publicationId, jobId } = await seedUnknown();
    const body = { outcome: 'sent', revision: 0, externalMessageId: '9001' };

    expect((await resolve(publicationId, body)).status).toBe(200);
    await expectError(await resolve(publicationId, body), 409, 'CONFLICT', { reason: 'NOT_UNKNOWN' });

    expect(await get(publicationId)).toMatchObject({ status: 'sent', revision: 1, externalMessageId: '9001' });
    expect(await auditOf(publicationId)).toHaveLength(1);
    expect((await incidentsOf(jobId))[0]?.resolved_at).toBe(clock.now());
  });

  it.each([
    [
      'the same answer twice',
      { outcome: 'sent', revision: 0, externalMessageId: '9001' },
      { outcome: 'sent', revision: 0, externalMessageId: '9001' }
    ],
    [
      'sent and cancel',
      { outcome: 'sent', revision: 0, externalMessageId: '9001' },
      { outcome: 'cancel', revision: 0 }
    ],
    [
      'resend and cancel',
      { outcome: 'resend', revision: 0, scheduledAt: iso(START + 5 * MINUTE), timezone: 'UTC' },
      { outcome: 'cancel', revision: 0 }
    ]
  ])('lets exactly one of two concurrent requests win: %s', async (_name, first, second) => {
    const { publicationId, jobId } = await seedUnknown();

    const responses = await Promise.all([resolve(publicationId, first), resolve(publicationId, second)]);

    const winners = responses.filter((response) => response.status === 200);
    expect(winners).toHaveLength(1);
    const loser = responses.find((response) => response.status !== 200) as Response;
    await expectError(loser, 409, 'CONFLICT');
    const won = publicationSchema.parse(await (winners[0] as Response).json());
    expect(won.revision).toBe(1);
    expect(await get(publicationId)).toMatchObject({ revision: 1, status: won.status });
    expect(await auditOf(publicationId)).toHaveLength(1);
    expect((await incidentsOf(jobId))[0]?.resolved_at).toBe(clock.now());
    const job = await jobOf(publicationId);
    const jobStatusOf: Record<string, string> = { sent: 'succeeded', scheduled: 'pending', cancelled: 'cancelled' };
    expect(job.status).toBe(jobStatusOf[won.status]);
  });
});
