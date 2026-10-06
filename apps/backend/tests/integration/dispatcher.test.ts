import { beforeEach, describe, expect, it } from 'vitest';
import type { Container } from '../../src/app/container';
import { createContainer } from '../../src/app/container';
import type { PublicationTransport } from '../../src/modules/publishing';
import { LEASE_MS, MAX_ATTEMPTS } from '../../src/modules/publishing/domain/dispatch-policy';
import { testDb } from '../helpers/db';
import {
  adapterTransport,
  attemptsOf,
  fakeTransport,
  grammyError,
  HttpError,
  incidentsOf,
  makeTick,
  MINUTE_TICK,
  publicationOf,
  SENT,
  seedDueJob,
  tickCount
} from '../helpers/dispatch';
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
import { claimJob, count, jobOf, seedApprovedPost, seedDestination } from '../helpers/publishing';

let clock: FakeClock;
let api: Api;

beforeEach(async () => {
  await resetDb();
  await seedSession({ token: OWNER_TOKEN, expiresAt: START + 400 * 24 * 60 * 60_000 });
  clock = fakeClock();
  api = createApi({ clock });
});

const tickWith = (
  transport: PublicationTransport = fakeTransport(SENT),
  extra: { publishing?: string; tweak?: (c: Container) => Container } = {}
) => makeTick({ clock, transport, ...extra });

describe('a due job is sent once and recorded', () => {
  it('sends the escaped HTML message to the destination and marks everything in D1', async () => {
    const { publicationId, jobId, chatId } = await seedDueJob(api);
    const transport = fakeTransport(SENT);

    await tickWith(transport).run();

    expect(transport.calls).toEqual([{ chatId, text: '<b>Patch 7.40</b>\n\nBody text' }]);
    const job = await jobOf(publicationId);
    expect(job).toMatchObject({ status: 'succeeded', attempts: 1, lease_until: null });
    expect(job.send_started_at).toBe(START);
    expect(await publicationOf(publicationId)).toEqual({ external_message_id: '4242', last_error_code: null });
    expect(await attemptsOf(jobId)).toEqual([
      {
        attempt: 1,
        outcome: 'sent',
        error_code: null,
        retry_after: null,
        external_message_id: '4242',
        started_at: START,
        finished_at: START
      }
    ]);
    expect(await incidentsOf(jobId)).toEqual([]);
    const audit = await testDb()
      .prepare("SELECT actor_telegram_id, action, entity_type, entity_id FROM audit_log WHERE action = 'job.succeeded'")
      .all();
    expect(audit.results).toEqual([
      { actor_telegram_id: 'system', action: 'job.succeeded', entity_type: 'publication', entity_id: publicationId }
    ]);
  });

  it('a repeated Cron tick sends nothing more', async () => {
    const { publicationId } = await seedDueJob(api);
    const transport = fakeTransport(SENT);

    await tickWith(transport).run();
    clock.advance(60_000);
    await tickWith(transport).run();
    clock.advance(24 * 60 * 60_000);
    await tickWith(transport).run();

    expect(transport.calls).toHaveLength(1);
    expect((await jobOf(publicationId)).attempts).toBe(1);
    expect(await count('job_attempts')).toBe(1);
  });

  it('does not send a job that is not due yet', async () => {
    const post = await seedApprovedPost(api);
    const destination = await seedDestination(api);
    const response = await api.request('/api/v1/publications', {
      method: 'POST',
      headers: { 'idempotency-key': 'future-1' },
      json: {
        postId: post.id,
        revision: post.revision,
        destinationId: destination.id,
        scheduledAt: new Date(START + 60 * 60_000).toISOString(),
        timezone: 'Europe/Moscow'
      }
    });
    expect(response.status).toBe(202);
    const transport = fakeTransport(SENT);

    await tickWith(transport).run();
    clock.advance(60 * 60_000 - 1);
    await tickWith(transport).run();
    expect(transport.calls).toHaveLength(0);

    clock.advance(1);
    await tickWith(transport).run();
    expect(transport.calls).toHaveLength(1);
  });

  it('escapes <, > and & (and quotes) in the post, so user text can never become markup', async () => {
    const post = await seedApprovedPost(api, 'Tom & Jerry <b>');
    await testDb()
      .prepare("UPDATE post_revisions SET body = ?1 WHERE post_id = ?2 AND status = 'approved'")
      .bind('1 < 2 > 0 && "quoted" <script>', post.id)
      .run();
    const destination = await seedDestination(api, { chatId: '-1001' });
    const created = await api.request('/api/v1/publications', {
      method: 'POST',
      headers: { 'idempotency-key': 'escape-1' },
      json: {
        postId: post.id,
        revision: post.revision,
        destinationId: destination.id,
        scheduledAt: new Date(START).toISOString(),
        timezone: 'Europe/Moscow'
      }
    });
    expect(created.status).toBe(202);
    const transport = fakeTransport(SENT);

    await tickWith(transport).run();

    expect(transport.calls).toEqual([
      {
        chatId: '-1001',
        text: '<b>Tom &amp; Jerry &lt;b&gt;</b>\n\n1 &lt; 2 &gt; 0 &amp;&amp; &quot;quoted&quot; &lt;script&gt;'
      }
    ]);
  });
});

describe('races', () => {
  // Both ticks select the job before either claims it, so the claim itself decides the race.
  function bothSelectFirst(): (container: Container) => Container {
    let arrived = 0;
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    return (container) => ({
      ...container,
      dispatchJobs: {
        ...container.dispatchJobs,
        async findDueJobIds(now, limit) {
          const ids = await container.dispatchJobs.findDueJobIds(now, limit);
          arrived += 1;
          if (arrived === 2) release();
          await gate;
          return ids;
        }
      }
    });
  }

  it('two Cron ticks at once send the job once', async () => {
    const { publicationId } = await seedDueJob(api);
    const transport = fakeTransport(SENT);
    const tweak = bothSelectFirst();
    const first = tickWith(transport, { tweak });
    const second = tickWith(transport, { tweak });

    await Promise.all([first.run(), second.run()]);

    expect(transport.calls).toHaveLength(1);
    expect(await jobOf(publicationId)).toMatchObject({ status: 'succeeded', attempts: 1 });
    expect(await count('job_attempts')).toBe(1);
    expect(tickCount(first, 'lost') + tickCount(second, 'lost')).toBe(1);
    expect(tickCount(first, 'sent') + tickCount(second, 'sent')).toBe(1);
  });

  it('a job cancelled between the select and the claim is not sent', async () => {
    const { publicationId } = await seedDueJob(api);
    const transport = fakeTransport(SENT);
    const tick = tickWith(transport, {
      tweak: (container) => ({
        ...container,
        dispatchJobs: {
          ...container.dispatchJobs,
          async findDueJobIds(now, limit) {
            const ids = await container.dispatchJobs.findDueJobIds(now, limit);
            const cancelled = await api.request(`/api/v1/publications/${publicationId}/cancel`, {
              method: 'POST',
              json: { revision: 0 }
            });
            expect(cancelled.status).toBe(200);
            return ids;
          }
        }
      })
    });

    await tick.run();

    expect(transport.calls).toHaveLength(0);
    expect((await jobOf(publicationId)).status).toBe('cancelled');
    expect(tickCount(tick, 'lost')).toBe(1);
  });
});

describe('crashes and leases', () => {
  it('a tick that died before send_started_at is picked up again after the lease expires', async () => {
    const { publicationId, jobId } = await seedDueJob(api);
    expect(await claimJob(jobId, clock.now(), clock.now() + LEASE_MS)).toBe(1);
    const transport = fakeTransport(SENT);

    clock.advance(LEASE_MS - 1);
    await tickWith(transport).run();
    expect(await jobOf(publicationId)).toMatchObject({ status: 'claimed', attempts: 1 });

    clock.advance(1 + 1);
    await tickWith(transport).run();
    const waiting = await jobOf(publicationId);
    expect(waiting).toMatchObject({ status: 'retry_wait', attempts: 1, send_started_at: null, lease_until: null });
    expect(transport.calls).toHaveLength(0);
    expect((await attemptsOf(jobId)).map((row) => row.outcome)).toEqual(['lease_expired']);

    clock.set(waiting.run_at);
    await tickWith(transport).run();
    expect(transport.calls).toHaveLength(1);
    expect(await jobOf(publicationId)).toMatchObject({ status: 'succeeded', attempts: 2 });
    expect((await attemptsOf(jobId)).map((row) => row.outcome)).toEqual(['lease_expired', 'sent']);
  });

  it('a crash after send_started_at ends as unknown, and no later tick sends it again', async () => {
    const { publicationId, jobId } = await seedDueJob(api);
    const transport = fakeTransport(SENT);
    // The Worker dies after the call: the outcome write never happens.
    const crashing = tickWith(transport, {
      tweak: (container) => ({
        ...container,
        dispatchJobs: {
          ...container.dispatchJobs,
          resolve: () => Promise.reject(new Error('worker died'))
        }
      })
    });

    await expect(crashing.run()).rejects.toThrow('SCHEDULED_TICK_FAILED');

    expect(transport.calls).toHaveLength(1);
    const stuck = await jobOf(publicationId);
    expect(stuck).toMatchObject({ status: 'claimed', attempts: 1 });
    expect(stuck.send_started_at).toBe(START);

    clock.advance(LEASE_MS + 1);
    const later = tickWith(transport);
    await later.run();

    expect(await jobOf(publicationId)).toMatchObject({ status: 'unknown', attempts: 1, lease_until: null });
    expect(await attemptsOf(jobId)).toMatchObject([{ attempt: 1, outcome: 'unknown', error_code: 'SEND_UNCONFIRMED' }]);
    const incidents = await incidentsOf(jobId);
    expect(incidents).toHaveLength(1);
    expect(incidents[0]).toMatchObject({ kind: 'publish_unknown', code: 'SEND_UNCONFIRMED', resolved_at: null });
    expect(await publicationOf(publicationId)).toEqual({
      external_message_id: null,
      last_error_code: 'SEND_UNCONFIRMED'
    });

    for (let minute = 0; minute < 3; minute += 1) {
      clock.advance(24 * 60 * 60_000);
      await tickWith(transport).run();
    }
    expect(transport.calls).toHaveLength(1);
    expect((await jobOf(publicationId)).status).toBe('unknown');
    expect(await count('incidents')).toBe(1);
  });

  it('the first outcome write is repeated once, so a transient D1 error does not turn a sent post into unknown', async () => {
    const { publicationId } = await seedDueJob(api);
    let failures = 1;
    const tick = tickWith(fakeTransport(SENT), {
      tweak: (container) => ({
        ...container,
        dispatchJobs: {
          ...container.dispatchJobs,
          resolve: (resolution) => {
            if (failures > 0) {
              failures -= 1;
              return Promise.reject(new Error('D1 hiccup'));
            }
            return container.dispatchJobs.resolve(resolution);
          }
        }
      })
    });

    await tick.run();

    expect(await jobOf(publicationId)).toMatchObject({ status: 'succeeded' });
    expect(await count('job_attempts')).toBe(1);
  });

  it('a first write that committed but threw is recognised as applied, not logged as not applied', async () => {
    const { publicationId } = await seedDueJob(api);
    const tick = tickWith(fakeTransport(SENT), {
      tweak: (container) => ({
        ...container,
        dispatchJobs: {
          ...container.dispatchJobs,
          resolve: async (resolution) => {
            await container.dispatchJobs.resolve(resolution);
            throw new Error('response lost');
          }
        }
      })
    });

    await tick.run();

    expect(await jobOf(publicationId)).toMatchObject({ status: 'succeeded' });
    expect(await count('job_attempts')).toBe(1);
    const jobLine = tick.logs.find((entry) => entry.operation === 'job');
    expect(jobLine).toMatchObject({ status: 'succeeded', level: 'info' });
    expect(jobLine).not.toHaveProperty('errorCode');
    expect(JSON.stringify(tick.logs)).not.toContain('OUTCOME_NOT_APPLIED');
  });

  it('allows one outcome-write retry per tick: a second failing write stops the tick', async () => {
    const first = await seedDueJob(api);
    const second = await seedDueJob(api);
    const transport = fakeTransport(SENT);
    const failedOnce = new Set<string>();
    const tick = tickWith(transport, {
      tweak: (container) => ({
        ...container,
        dispatchJobs: {
          ...container.dispatchJobs,
          resolve: (resolution) => {
            if (!failedOnce.has(resolution.jobId)) {
              failedOnce.add(resolution.jobId);
              return Promise.reject(new Error('D1 hiccup'));
            }
            return container.dispatchJobs.resolve(resolution);
          }
        }
      })
    });

    await expect(tick.run()).rejects.toThrow('SCHEDULED_TICK_FAILED');

    // Whichever job went first got its retry; the next one's first failure ended the tick.
    expect(transport.calls).toHaveLength(2);
    const statuses = [(await jobOf(first.publicationId)).status, (await jobOf(second.publicationId)).status].sort();
    expect(statuses).toEqual(['claimed', 'succeeded']);
  });

  it('does not call Telegram when the lease would not outlive the send, and reconcile recovers the job', async () => {
    const { publicationId } = await seedDueJob(api);
    const transport = fakeTransport(SENT);
    // The clock jumps between the claim and the send mark (a stalled D1 call).
    const tick = tickWith(transport, {
      tweak: (container) => ({
        ...container,
        dispatchJobs: {
          ...container.dispatchJobs,
          async loadTarget(id) {
            clock.advance(LEASE_MS - 1_000);
            return container.dispatchJobs.loadTarget(id);
          }
        }
      })
    });

    await tick.run();

    expect(transport.calls).toHaveLength(0);
    expect(await jobOf(publicationId)).toMatchObject({ status: 'claimed', send_started_at: null });

    clock.advance(2_000);
    await tickWith(transport).run();
    expect((await jobOf(publicationId)).status).toBe('retry_wait');
  });

  it('a late outcome write after reconcile resolved the job changes nothing', async () => {
    const { publicationId, jobId } = await seedDueJob(api);
    const tick = tickWith(fakeTransport(SENT));
    const repo = tick.container.dispatchJobs;
    const claimed = await repo.claim(jobId, clock.now(), clock.now() + LEASE_MS);
    expect(claimed).not.toBeNull();
    expect(await repo.markSendStarted({ jobId, attempt: 1, now: clock.now(), minLeaseUntil: clock.now() })).toBe(true);

    clock.advance(LEASE_MS + 1);
    await tick.run();
    expect((await jobOf(publicationId)).status).toBe('unknown');

    const applied = await repo.resolve({
      jobId,
      publicationId,
      attempt: 1,
      startedAt: START,
      finishedAt: clock.now(),
      status: 'succeeded',
      attemptOutcome: 'sent',
      errorCode: null,
      retryAfterSec: null,
      externalMessageId: '99',
      incident: null,
      auditAction: 'job.succeeded'
    });

    expect(applied).toBe(false);
    expect((await jobOf(publicationId)).status).toBe('unknown');
    expect(await count('job_attempts')).toBe(1);
    expect(await publicationOf(publicationId)).toMatchObject({ external_message_id: null });
  });

  it('reconcile that lost the race to the dispatcher writes nothing', async () => {
    const { publicationId, jobId } = await seedDueJob(api);
    const tick = tickWith(fakeTransport(SENT));
    const repo = tick.container.dispatchJobs;
    await repo.claim(jobId, clock.now(), clock.now() + LEASE_MS);
    await repo.markSendStarted({ jobId, attempt: 1, now: clock.now(), minLeaseUntil: clock.now() });
    clock.advance(LEASE_MS + 1);
    const expired = await repo.findExpiredClaims(clock.now(), 10);
    expect(expired).toHaveLength(1);

    // The slow dispatcher finishes just before reconcile writes.
    await repo.resolve({
      jobId,
      publicationId,
      attempt: 1,
      startedAt: START,
      finishedAt: clock.now(),
      status: 'succeeded',
      attemptOutcome: 'sent',
      errorCode: null,
      retryAfterSec: null,
      externalMessageId: '77',
      incident: null,
      auditAction: 'job.succeeded'
    });
    const applied = await repo.resolveExpired(
      [
        {
          sendStarted: true,
          resolution: {
            jobId,
            publicationId,
            attempt: 1,
            startedAt: START,
            finishedAt: clock.now(),
            status: 'unknown',
            attemptOutcome: 'unknown',
            errorCode: 'SEND_UNCONFIRMED',
            retryAfterSec: null,
            externalMessageId: null,
            incident: {
              id: crypto.randomUUID(),
              kind: 'publish_unknown',
              code: 'SEND_UNCONFIRMED',
              details: { attempt: 1 }
            },
            auditAction: 'job.unknown'
          }
        }
      ],
      clock.now()
    );

    expect(applied).toEqual([false]);
    expect((await jobOf(publicationId)).status).toBe('succeeded');
    expect(await incidentsOf(jobId)).toEqual([]);
    expect(await attemptsOf(jobId)).toHaveLength(1);
  });
});

describe('what Telegram answers', () => {
  const run = async (step: () => Promise<unknown>, timeoutMs?: number) => {
    const seeded = await seedDueJob(api);
    const { transport, sender } = adapterTransport(step, timeoutMs);
    await tickWith(transport).run();
    return { ...seeded, sender, job: await jobOf(seeded.publicationId) };
  };

  it('ok with a message_id: succeeded, with the id on the publication', async () => {
    const { job, publicationId, sender } = await run(() => Promise.resolve({ message_id: 321, chat: { id: 1 } }));

    expect(job.status).toBe('succeeded');
    expect((await publicationOf(publicationId)).external_message_id).toBe('321');
    expect(sender.requests[0]?.other).toEqual({ parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
  });

  it('429: retry_wait at retry_after, send mark cleared, no incident', async () => {
    const { job, jobId, publicationId } = await run(() =>
      Promise.reject(grammyError(429, 'Too Many Requests: retry after 30', { retry_after: 30 }))
    );

    expect(job).toMatchObject({ status: 'retry_wait', attempts: 1, send_started_at: null, lease_until: null });
    expect(job.run_at).toBe(START + 30_000);
    expect(await attemptsOf(jobId)).toMatchObject([
      { outcome: 'rate_limited', error_code: 'RATE_LIMITED', retry_after: 30 }
    ]);
    expect(await incidentsOf(jobId)).toEqual([]);
    expect((await publicationOf(publicationId)).last_error_code).toBe('RATE_LIMITED');
  });

  it('429: the retry runs after retry_after plus jitter, and not before', async () => {
    const { publicationId } = await seedDueJob(api);
    const transport = fakeTransport({ kind: 'rate_limited', retryAfterSec: 30 }, SENT);
    // random 0.5 of a 5 s jitter window
    await makeTick({ clock, transport, random: () => 0.5 }).run();
    const job = await jobOf(publicationId);
    expect(job.run_at).toBe(START + 30_000 + 2_500);

    clock.set(job.run_at - 1);
    await tickWith(transport).run();
    expect(transport.calls).toHaveLength(1);

    clock.set(job.run_at);
    await tickWith(transport).run();
    expect(transport.calls).toHaveLength(2);
    expect(await jobOf(publicationId)).toMatchObject({ status: 'succeeded', attempts: 2 });
  });

  it.each([
    [
      '400 migrate_to_chat_id',
      () =>
        grammyError(400, 'Bad Request: group chat was upgraded to a supergroup chat', { migrate_to_chat_id: -100123 }),
      'CHAT_MIGRATED'
    ],
    [
      '400 cannot parse entities',
      () => grammyError(400, "Bad Request: can't parse entities: Unsupported start tag"),
      'CONTENT_INVALID'
    ],
    ['400 message is too long', () => grammyError(400, 'Bad Request: message is too long'), 'CONTENT_INVALID'],
    [
      '403 bot was kicked',
      () => grammyError(403, 'Forbidden: bot was kicked from the channel chat'),
      'DESTINATION_UNAVAILABLE'
    ],
    [
      '403 bot is not a member',
      () => grammyError(403, 'Forbidden: bot is not a member of the channel chat'),
      'DESTINATION_UNAVAILABLE'
    ],
    ['400 chat not found', () => grammyError(400, 'Bad Request: chat not found'), 'DESTINATION_UNAVAILABLE']
  ])('%s: failed %s, with an incident and no retry', async (_name, error, code) => {
    const { job, jobId, publicationId } = await run(() => Promise.reject(error()));

    expect(job).toMatchObject({ status: 'failed', attempts: 1, lease_until: null });
    expect(job.send_started_at).toBe(START);
    expect(await attemptsOf(jobId)).toMatchObject([{ outcome: 'rejected', error_code: code }]);
    expect(await incidentsOf(jobId)).toMatchObject([{ kind: 'publish_failed', code, publication_id: publicationId }]);
    expect((await publicationOf(publicationId)).last_error_code).toBe(code);

    clock.advance(24 * 60 * 60_000);
    await tickWith(fakeTransport(SENT)).run();
    expect((await jobOf(publicationId)).status).toBe('failed');
  });

  it.each([
    ['a 5xx answer', () => Promise.reject(grammyError(502, 'Bad Gateway')), 'telegram_http_502'],
    [
      'a network error',
      () => Promise.reject(new HttpError('Network request failed', new Error('reset'))),
      'network_error'
    ],
    ['ok without a message_id', () => Promise.resolve({ chat: { id: 1 } }), 'ok_without_message_id'],
    ['an unexpected failure', () => Promise.reject(new Error('boom')), 'unexpected_error']
  ])('%s: unknown with an incident, and never sent again', async (_name, step, reason) => {
    const { job, jobId, publicationId } = await run(step);

    expect(job).toMatchObject({ status: 'unknown', attempts: 1 });
    expect(job.send_started_at).toBe(START);
    expect(await attemptsOf(jobId)).toMatchObject([{ outcome: 'unknown', error_code: 'SEND_UNCONFIRMED' }]);
    const [incident] = await incidentsOf(jobId);
    expect(incident).toMatchObject({ kind: 'publish_unknown', code: 'SEND_UNCONFIRMED' });
    expect(JSON.parse(incident?.details ?? '{}')).toEqual({ attempt: 1, reason });
    expect((await publicationOf(publicationId)).external_message_id).toBeNull();

    const transport = fakeTransport(SENT);
    for (const hours of [1, 24, 72]) {
      clock.advance(hours * 60 * 60_000);
      await tickWith(transport).run();
    }
    expect(transport.calls).toHaveLength(0);
    expect((await jobOf(publicationId)).status).toBe('unknown');
  });

  it.each([
    [401, 'Unauthorized'],
    [404, 'Not Found']
  ])(
    '%i (wrong bot token): the job fails BOT_UNAUTHORIZED and the tick stops, leaving the other jobs pending',
    async (code, description) => {
      const first = await seedDueJob(api);
      const second = await seedDueJob(api);
      const third = await seedDueJob(api);
      const { transport, sender } = adapterTransport(() => Promise.reject(grammyError(code, description)));

      await tickWith(transport).run();

      expect(sender.requests).toHaveLength(1);
      const jobs = await Promise.all([first, second, third].map((seeded) => jobOf(seeded.publicationId)));
      expect(jobs.map((job) => job.status).sort()).toEqual(['failed', 'pending', 'pending']);
      const failed = jobs.find((job) => job.status === 'failed');
      expect(await attemptsOf(failed?.id ?? '')).toMatchObject([
        { outcome: 'rejected', error_code: 'BOT_UNAUTHORIZED' }
      ]);
      expect(await incidentsOf(failed?.id ?? '')).toMatchObject([{ kind: 'publish_failed', code: 'BOT_UNAUTHORIZED' }]);
    }
  );

  it('a timeout is unknown (reason timeout)', async () => {
    const { job, jobId } = await run(() => new Promise<never>(() => undefined), 20);

    expect(job.status).toBe('unknown');
    const [incident] = await incidentsOf(jobId);
    expect(JSON.parse(incident?.details ?? '{}')).toMatchObject({ reason: 'timeout' });
  });

  it('a transport that throws anyway is unknown, not lost', async () => {
    const { publicationId } = await seedDueJob(api);
    const throwing = {
      send: () => Promise.reject(new Error('adapter bug'))
    };

    await tickWith(throwing).run();

    expect((await jobOf(publicationId)).status).toBe('unknown');
  });
});

describe('bounded retries', () => {
  it('429 on every attempt: the fifth attempt fails the job with an incident', async () => {
    const { publicationId, jobId } = await seedDueJob(api);
    const transport = fakeTransport({ kind: 'rate_limited', retryAfterSec: 1 });

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      const job = await jobOf(publicationId);
      clock.set(Math.max(clock.now(), job.run_at));
      await tickWith(transport).run();
    }

    expect(transport.calls).toHaveLength(MAX_ATTEMPTS);
    expect(await jobOf(publicationId)).toMatchObject({ status: 'failed', attempts: MAX_ATTEMPTS });
    expect((await attemptsOf(jobId)).map((row) => row.outcome)).toEqual(
      Array<string>(MAX_ATTEMPTS).fill('rate_limited')
    );
    expect(await incidentsOf(jobId)).toMatchObject([{ kind: 'publish_failed', code: 'RETRIES_EXHAUSTED' }]);
    expect((await publicationOf(publicationId)).last_error_code).toBe('RETRIES_EXHAUSTED');

    clock.advance(24 * 60 * 60_000);
    await tickWith(transport).run();
    expect(transport.calls).toHaveLength(MAX_ATTEMPTS);
  });

  it('a job whose Worker keeps dying before the send mark also ends failed, not in an endless loop', async () => {
    const { publicationId, jobId } = await seedDueJob(api);
    await testDb()
      .prepare('UPDATE jobs SET attempts = ?1 WHERE id = ?2')
      .bind(MAX_ATTEMPTS - 1, jobId)
      .run();
    expect(await claimJob(jobId, clock.now(), clock.now() + LEASE_MS)).toBe(1);

    clock.advance(LEASE_MS + 1);
    await tickWith().run();

    expect(await jobOf(publicationId)).toMatchObject({ status: 'failed', attempts: MAX_ATTEMPTS });
    expect(await incidentsOf(jobId)).toMatchObject([{ kind: 'publish_failed', code: 'RETRIES_EXHAUSTED' }]);
  });
});

describe('refusals before the send', () => {
  it('a disabled destination fails the job without sending', async () => {
    const { publicationId, jobId, destinationId } = await seedDueJob(api);
    const disabled = await api.request(`/api/v1/destinations/${destinationId}`, {
      method: 'PATCH',
      json: { revision: 0, enabled: false }
    });
    expect(disabled.status).toBe(200);
    const transport = fakeTransport(SENT);

    await tickWith(transport).run();

    expect(transport.calls).toHaveLength(0);
    expect(await jobOf(publicationId)).toMatchObject({ status: 'failed', send_started_at: null });
    expect(await attemptsOf(jobId)).toMatchObject([{ outcome: 'skipped', error_code: 'DESTINATION_DISABLED' }]);
    expect(await incidentsOf(jobId)).toMatchObject([{ kind: 'publish_failed', code: 'DESTINATION_DISABLED' }]);
    expect((await publicationOf(publicationId)).last_error_code).toBe('DESTINATION_DISABLED');
  });

  it('content over 4096 characters after parsing fails the job without sending', async () => {
    const created = await api.request('/api/v1/posts', {
      method: 'POST',
      headers: { 'idempotency-key': 'long-post' },
      json: { title: 'T'.repeat(100), body: 'x'.repeat(4096) }
    });
    expect(created.status).toBe(201);
    const draft = (await created.json()) as { id: string; revision: number };
    const approved = await api.request(`/api/v1/posts/${draft.id}/approve`, {
      method: 'POST',
      json: { revision: draft.revision }
    });
    expect(approved.status).toBe(200);
    const destination = await seedDestination(api);
    const scheduled = await api.request('/api/v1/publications', {
      method: 'POST',
      headers: { 'idempotency-key': 'long-pub' },
      json: {
        postId: draft.id,
        revision: draft.revision + 1,
        destinationId: destination.id,
        scheduledAt: new Date(START).toISOString(),
        timezone: 'Europe/Moscow'
      }
    });
    expect(scheduled.status).toBe(202);
    const publicationId = ((await scheduled.json()) as { id: string }).id;
    const transport = fakeTransport(SENT);

    await tickWith(transport).run();

    expect(transport.calls).toHaveLength(0);
    const job = await jobOf(publicationId);
    expect(job).toMatchObject({ status: 'failed', send_started_at: null });
    expect(await attemptsOf(job.id)).toMatchObject([{ outcome: 'skipped', error_code: 'CONTENT_INVALID' }]);
    expect(await incidentsOf(job.id)).toMatchObject([{ code: 'CONTENT_INVALID' }]);
    expect(JSON.parse((await incidentsOf(job.id))[0]?.details ?? '{}')).toEqual({ attempt: 1, reason: 'too_long' });
  });
});

describe('the kill switch', () => {
  it.each(['false', '', 'TRUE', '1', 'yes', ' true'])(
    'PUBLISHING_ENABLED=%j claims and sends nothing',
    async (value) => {
      const { publicationId } = await seedDueJob(api);
      const transport = fakeTransport(SENT);

      const tick = tickWith(transport, { publishing: value });
      await tick.run();

      expect(transport.calls).toHaveLength(0);
      expect(await jobOf(publicationId)).toMatchObject({ status: 'pending', attempts: 0 });
      expect(tickCount(tick, 'publishingEnabled')).toBe(0);
    }
  );

  it('reconcile still runs while publishing is off', async () => {
    const { publicationId, jobId } = await seedDueJob(api);
    await claimJob(jobId, clock.now(), clock.now() + LEASE_MS);
    clock.advance(LEASE_MS + 1);

    await tickWith(fakeTransport(SENT), { publishing: 'false' }).run();

    expect((await jobOf(publicationId)).status).toBe('retry_wait');
  });

  it('switched on without a bot token it claims nothing and says so', async () => {
    const { publicationId } = await seedDueJob(api);
    const container = createContainer({ DB: testDb(), PUBLISHING_ENABLED: 'true' }, { clock });
    expect(container.publishing).toEqual({ enabled: false, blockedBy: 'bot_token_missing' });
    const logs: string[] = [];
    // Not spread: reading `transport` without a token throws, which is exactly what must not happen.
    const quiet: Container = Object.create(container, {
      logger: {
        value: { info: () => undefined, warn: (e: object) => logs.push(JSON.stringify(e)), error: () => undefined }
      }
    });

    const { handleScheduled } = await import('../../src/app/scheduled');
    await handleScheduled({ cron: '* * * * *', scheduledTime: MINUTE_TICK } as ScheduledController, quiet);

    expect(await jobOf(publicationId)).toMatchObject({ status: 'pending', attempts: 0 });
    expect(logs.join()).toContain('BOT_TOKEN_MISSING');
  });

  it.each(['   ', '\t\n'])('a whitespace-only bot token %j counts as missing', (token) => {
    const container = createContainer({ DB: testDb(), PUBLISHING_ENABLED: 'true', TELEGRAM_BOT_TOKEN: token });

    expect(container.publishing).toEqual({ enabled: false, blockedBy: 'bot_token_missing' });
    expect(() => container.transport).toThrow('not configured');
  });

  it('wires the real grammY transport when the token is set (nothing is sent by building it)', () => {
    const container = createContainer({
      DB: testDb(),
      PUBLISHING_ENABLED: 'true',
      TELEGRAM_BOT_TOKEN: '123456:TEST-BOT-TOKEN-PLACEHOLDER'
    });

    expect(container.publishing).toEqual({ enabled: true });
    expect(typeof container.transport.send).toBe('function');
  });

  it('health reports the effective switch', async () => {
    const on = await createApi({ clock, publishingEnabled: 'true' }).request('/api/v1/health', { token: null });
    const off = await createApi({ clock, publishingEnabled: 'false' }).request('/api/v1/health', { token: null });
    const noToken = await createApi({ clock, publishingEnabled: 'true', botToken: null }).request('/api/v1/health', {
      token: null
    });

    expect(((await on.json()) as { publishingEnabled: boolean }).publishingEnabled).toBe(true);
    expect(((await off.json()) as { publishingEnabled: boolean }).publishingEnabled).toBe(false);
    expect(((await noToken.json()) as { publishingEnabled: boolean }).publishingEnabled).toBe(false);
  });
});

describe('logs', () => {
  it('log one JSON event per job and never the token, the text or Telegram bodies', async () => {
    const { jobId } = await seedDueJob(api, { title: 'Secret launch title' });
    const tick = tickWith(fakeTransport({ kind: 'unknown', reason: 'telegram_http_502' }));

    await tick.run();

    const jobLine = tick.logs.find((entry) => entry.operation === 'job');
    expect(jobLine).toMatchObject({
      component: 'dispatcher',
      jobId,
      attempt: 1,
      status: 'unknown',
      errorCode: 'SEND_UNCONFIRMED'
    });
    expect(typeof jobLine?.durationMs).toBe('number');
    const text = JSON.stringify(tick.logs);
    expect(text).not.toContain('Secret launch title');
    expect(text).not.toContain('TEST-BOT-TOKEN');
    expect(text).not.toContain('Body text');
  });
});
