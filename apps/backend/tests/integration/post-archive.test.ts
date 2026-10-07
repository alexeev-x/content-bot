import { env } from 'cloudflare:workers';
import {
  bulkRestorePostsResultSchema,
  postPageSchema,
  postSchema,
  type PostDto,
  type PostPageDto
} from '@alexeev/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { ARCHIVE_RETENTION_MS } from '../../src/shared/archive-retention';
import { testDb } from '../helpers/db';
import {
  fakeTransport,
  HOURLY_TICK,
  isoAt,
  makeTick,
  MINUTE_TICK,
  SENT,
  seedDueJob,
  tickCount
} from '../helpers/dispatch';
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
import {
  addScheduled,
  DAY,
  getPost,
  PURGE_TICK_OFFSET,
  postRow,
  runTick,
  seedSentPost,
  setJob,
  tableCounts
} from '../helpers/lifecycle';
import { count, jobOf, seedApprovedPost, seedDestination, seedPublication } from '../helpers/publishing';

let clock: FakeClock;
let api: Api;

beforeEach(async () => {
  await resetDb();
  await seedSession({ token: OWNER_TOKEN, expiresAt: START + 400 * DAY });
  clock = fakeClock();
  api = createApi({ clock });
});

const MINUTE = 60_000;
const PURGE_TICK = START + PURGE_TICK_OFFSET;

async function list(query = ''): Promise<PostPageDto> {
  const response = await api.request(`/api/v1/posts${query}`);
  expect(response.status).toBe(200);
  return postPageSchema.parse(await response.json());
}

const restore = (id: string, revision: number) =>
  api.request(`/api/v1/posts/${id}/restore`, { method: 'POST', json: { revision } });

describe('the post DTO', () => {
  it('a live approved post has no archive dates and an all-zero summary', async () => {
    const post = await seedApprovedPost(api);

    const dto = await getPost(api, post.id);

    expect(dto).toMatchObject({ archivedAt: null, autoDeleteAt: null });
    expect(dto.publicationSummary).toEqual({
      counts: {
        scheduled: 0,
        queued: 0,
        preparing: 0,
        sending: 0,
        sent: 0,
        retry_wait: 0,
        failed: 0,
        unknown: 0,
        cancelled: 0
      },
      nextScheduled: null,
      lastSentAt: null,
      destinations: []
    });
  });

  it('summarises counts by status, the nearest waiting time, the last sent time and the destinations', async () => {
    const post = await seedApprovedPost(api);
    const [alpha, beta, gamma, delta, epsilon] = await Promise.all(
      ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon'].map((title) => seedDestination(api, { title }))
    );
    const publish = (destinationId: string, at: number) =>
      seedPublication(api, { postId: post.id, revision: post.revision, destinationId, scheduledAt: isoAt(at) });
    const later = await publish(beta!.id, START + 2 * 60 * MINUTE);
    const nearest = await publish(alpha!.id, START + 60 * MINUTE);
    const sentNow = await publish(gamma!.id, START);
    const cancelled = await publish(delta!.id, START + 3 * 60 * MINUTE);
    const failed = await publish(epsilon!.id, START + 4 * 60 * MINUTE);
    await runTick(clock);
    await api
      .request(`/api/v1/publications/${cancelled.id}/cancel`, { method: 'POST', json: { revision: 0 } })
      .then((response) => expect(response.status).toBe(200));
    await setJob(failed.id, "status = 'failed', attempts = 1");
    expect((await jobOf(sentNow.id)).status).toBe('succeeded');
    expect(later.status).toBe('scheduled');

    const dto = await getPost(api, post.id);

    expect(dto.publicationSummary.counts).toMatchObject({ scheduled: 2, sent: 1, cancelled: 1, failed: 1, unknown: 0 });
    expect(dto.publicationSummary.nextScheduled).toEqual({
      scheduledAt: nearest.scheduledAt,
      destinationId: alpha!.id
    });
    expect(dto.publicationSummary.lastSentAt).toBe(isoAt(START));
    // Failed and cancelled ones did not go out, so their destinations are not listed.
    expect(dto.publicationSummary.destinations).toEqual([
      { id: alpha!.id, title: 'Alpha' },
      { id: beta!.id, title: 'Beta' },
      { id: gamma!.id, title: 'Gamma' }
    ]);
    expect(dto.archivedAt).toBeNull();
  });

  it('a due publication is queued, a claimed one is preparing or sending, and each is counted once', async () => {
    const queued = await seedDueJob(api);
    const preparing = await seedDueJob(api);
    const sending = await seedDueJob(api);
    await setJob(preparing.publicationId, "status = 'claimed', attempts = 1, lease_until = ?2", START + 2 * MINUTE);
    await setJob(
      sending.publicationId,
      "status = 'claimed', attempts = 1, lease_until = ?2, send_started_at = ?3",
      START + 2 * MINUTE,
      START
    );

    const counts = async (id: string) => (await getPost(api, id)).publicationSummary.counts;

    expect(await counts(queued.postId)).toMatchObject({ queued: 1, scheduled: 0 });
    expect(await counts(preparing.postId)).toMatchObject({ preparing: 1, sending: 0 });
    expect(await counts(sending.postId)).toMatchObject({ sending: 1, preparing: 0 });
  });
});

describe('GET /api/v1/posts views', () => {
  it('lists archived posts most recently archived first, pages through them, and keeps live posts out', async () => {
    const first = await seedSentPost(api, clock, 'First');
    clock.advance(MINUTE);
    const second = await seedSentPost(api, clock, 'Second');
    clock.advance(MINUTE);
    const third = await seedSentPost(api, clock, 'Third');
    const live = await seedApprovedPost(api, 'Live');

    const page = await list('?view=archive&limit=2');
    const next = await list(`?view=archive&limit=2&cursor=${page.nextCursor ?? ''}`);

    expect(page.items.map((post) => post.id)).toEqual([third.postId, second.postId]);
    expect(page.nextCursor).not.toBeNull();
    expect(next.items.map((post) => post.id)).toEqual([first.postId]);
    expect(next.nextCursor).toBeNull();
    expect([page.archivedCount, next.archivedCount]).toEqual([3, 3]);
    const everyone = await list();
    expect(everyone.items.map((post) => post.id)).toEqual([live.id]);
    expect(everyone.archivedCount).toBe(3);
    expect(page.items[0]).toMatchObject({
      archivedAt: isoAt(START + 2 * MINUTE),
      autoDeleteAt: isoAt(START + 2 * MINUTE + ARCHIVE_RETENTION_MS)
    });
    expect(page.items[0]?.publicationSummary.counts.sent).toBe(1);
  });

  it('applies the status filter within the view, and live is the default', async () => {
    await seedSentPost(api, clock);
    const draft = await api.request('/api/v1/posts', {
      method: 'POST',
      headers: { 'idempotency-key': 'k1' },
      json: { title: 'Draft' }
    });
    expect(draft.status).toBe(201);

    expect((await list('?view=archive&status=draft')).items).toEqual([]);
    expect((await list('?view=archive&status=approved')).items).toHaveLength(1);
    expect((await list('?status=draft')).items).toHaveLength(1);
    expect((await list('?view=live&status=approved')).items).toEqual([]);
  });

  it('rejects an unknown view', async () => {
    await expectError(await api.request('/api/v1/posts?view=trash'), 400, 'VALIDATION_ERROR');
  });
});

describe('the Cron archive step', () => {
  it('moves a post whose only publication was sent into the archive within the same tick', async () => {
    const seeded = await seedDueJob(api);
    const tick = makeTick({ clock, transport: fakeTransport(SENT) });

    await tick.run();

    expect(tickCount(tick, 'archived')).toBe(1);
    const post = await getPost(api, seeded.postId);
    expect(post).toMatchObject({
      status: 'approved',
      archivedAt: isoAt(START),
      autoDeleteAt: isoAt(START + ARCHIVE_RETENTION_MS)
    });
    expect((await list()).items).toEqual([]);
    expect((await list('?view=archive')).items.map((item) => item.id)).toEqual([seeded.postId]);
    const audit = await testDb()
      .prepare("SELECT actor_telegram_id, entity_id, details FROM audit_log WHERE action = 'post.archive'")
      .all();
    expect(audit.results).toEqual([
      { actor_telegram_id: 'system', entity_id: seeded.postId, details: '{"reason":"sent"}' }
    ]);
    // The revision is untouched: archiving is a lifecycle fact, not an edit.
    expect(post.revision).toBe(1);
  });

  it('keeps a post live while a second publication is waiting, and archives it once that one is sent', async () => {
    const seeded = await seedDueJob(api);
    const post = await getPost(api, seeded.postId);
    await addScheduled(api, post.id, post.revision, START + 30 * MINUTE);

    await runTick(clock);

    expect((await getPost(api, post.id)).archivedAt).toBeNull();
    expect((await list()).items.map((item) => item.id)).toEqual([post.id]);

    clock.set(START + 30 * MINUTE);
    await runTick(clock);

    expect((await getPost(api, post.id)).archivedAt).toBe(isoAt(START + 30 * MINUTE));
  });

  it('a sent post whose other publication is cancelled is archived on the next tick', async () => {
    const seeded = await seedDueJob(api);
    const post = await getPost(api, seeded.postId);
    const waiting = await addScheduled(api, post.id, post.revision, START + 30 * MINUTE);
    await runTick(clock);
    expect((await getPost(api, post.id)).archivedAt).toBeNull();

    clock.advance(MINUTE);
    const cancelled = await api.request(`/api/v1/publications/${waiting.id}/cancel`, {
      method: 'POST',
      json: { revision: 0 }
    });
    expect(cancelled.status).toBe(200);
    await runTick(clock);

    expect((await getPost(api, post.id)).archivedAt).toBe(isoAt(START + MINUTE));
  });

  it('a sent post whose other publication failed is archived once that failure is final', async () => {
    const seeded = await seedDueJob(api);
    const post = await getPost(api, seeded.postId);
    const other = await addScheduled(api, post.id, post.revision, START + 30 * MINUTE);
    await runTick(clock);
    clock.advance(MINUTE);
    await setJob(other.id, "status = 'failed', attempts = 1, updated_at = ?2", clock.now());

    await runTick(clock);

    expect((await getPost(api, post.id)).archivedAt).toBe(isoAt(START + MINUTE));
  });

  it.each([
    ['unknown', "status = 'unknown', attempts = 1, send_started_at = ?2", [START]],
    ['retry_wait', "status = 'retry_wait', attempts = 1", []],
    ['claimed', "status = 'claimed', attempts = 1, lease_until = ?2", [START + 10 * MINUTE]]
  ])('never archives a post with a %s publication', async (_name, set, bindings) => {
    const seeded = await seedDueJob(api);
    const post = await getPost(api, seeded.postId);
    const other = await addScheduled(api, post.id, post.revision, START + 30 * MINUTE);
    await runTick(clock);
    await setJob(other.id, set, ...bindings);

    await runTick(clock, { scheduledTime: HOURLY_TICK });

    expect((await getPost(api, post.id)).archivedAt).toBeNull();
  });

  it('does not archive a post whose publications are all failed or cancelled; it stays approved and live', async () => {
    const failed = await seedDueJob(api);
    const cancelled = await seedDueJob(api);
    await setJob(failed.publicationId, "status = 'failed', attempts = 1, updated_at = ?2", START);
    const cancel = await api.request(`/api/v1/publications/${cancelled.publicationId}/cancel`, {
      method: 'POST',
      json: { revision: 0 }
    });
    expect(cancel.status).toBe(200);

    await runTick(clock, { scheduledTime: HOURLY_TICK });

    const page = await list();
    expect(page.items.map((post) => [post.status, post.archivedAt])).toEqual([
      ['approved', null],
      ['approved', null]
    ]);
    expect(page.archivedCount).toBe(0);
    expect(
      page.items.map((post) => post.publicationSummary.counts.failed + post.publicationSummary.counts.cancelled)
    ).toEqual([1, 1]);
  });

  it('two overlapping ticks archive the post once', async () => {
    const seeded = await seedDueJob(api);
    // Sent by hand so that both ticks below only see the archive work.
    await runTick(clock);
    await testDb().prepare('UPDATE posts SET archived_at = NULL WHERE id = ?1').bind(seeded.postId).run();
    await testDb().prepare("DELETE FROM audit_log WHERE action = 'post.archive'").run();

    const first = makeTick({ clock, transport: fakeTransport(SENT) });
    const second = makeTick({ clock, transport: fakeTransport(SENT) });
    await Promise.all([first.run(), second.run()]);

    expect(await count('audit_log', "action = 'post.archive'")).toBe(1);
    expect((await postRow(seeded.postId))?.archived_at).toBe(START);
    expect(tickCount(first, 'archived') + tickCount(second, 'archived')).toBe(1);
  });

  it('a later tick leaves an archived post exactly as it was', async () => {
    const seeded = await seedSentPost(api, clock);
    const archivedAt = (await postRow(seeded.postId))?.archived_at;

    clock.advance(10 * MINUTE);
    await runTick(clock, { scheduledTime: HOURLY_TICK });

    expect((await postRow(seeded.postId))?.archived_at).toBe(archivedAt);
    expect(await count('audit_log', "action = 'post.archive'")).toBe(1);
  });

  it('a regular tick only looks at recent finishes; the hourly sweep looks back two days', async () => {
    const seeded = await seedSentPost(api, clock);
    await testDb().prepare('UPDATE posts SET archived_at = NULL WHERE id = ?1').bind(seeded.postId).run();

    clock.advance(60 * MINUTE);
    await runTick(clock, { scheduledTime: MINUTE_TICK });
    expect((await postRow(seeded.postId))?.archived_at).toBeNull();

    await runTick(clock, { scheduledTime: HOURLY_TICK });
    expect((await postRow(seeded.postId))?.archived_at).toBe(clock.now());
  });

  it('cannot be scheduled again for an archived post: restore first', async () => {
    const seeded = await seedSentPost(api, clock);
    const post = await getPost(api, seeded.postId);

    const response = await api.request('/api/v1/publications', {
      method: 'POST',
      headers: { 'idempotency-key': 'again' },
      json: {
        postId: post.id,
        revision: post.revision,
        destinationId: seeded.destinationId,
        scheduledAt: isoAt(START + 60 * MINUTE),
        timezone: 'UTC'
      }
    });

    await expectError(response, 409, 'CONFLICT', { reason: 'POST_ARCHIVED' });
    expect(await count('publications')).toBe(1);
  });
});

describe('restore', () => {
  it('brings the post back as approved at the top of the live list, sends nothing and creates no job', async () => {
    const seeded = await seedSentPost(api, clock);
    const other = await seedApprovedPost(api, 'Other');
    const archived = await getPost(api, seeded.postId);
    const before = await tableCounts();
    clock.advance(5 * MINUTE);

    const response = await restore(archived.id, archived.revision);

    expect(response.status).toBe(200);
    const restored = postSchema.parse(await response.json());
    expect(restored).toMatchObject({
      id: archived.id,
      status: 'approved',
      revision: archived.revision,
      archivedAt: null,
      autoDeleteAt: null,
      updatedAt: isoAt(clock.now())
    });
    // The history of what went out comes with it.
    expect(restored.publicationSummary.counts.sent).toBe(1);
    expect(restored.publicationSummary.lastSentAt).toBe(isoAt(START));
    const page = await list();
    expect(page.items.map((post) => post.id)).toEqual([archived.id, other.id]);
    expect(page.archivedCount).toBe(0);
    expect(await tableCounts()).toEqual(before);
    const transport = fakeTransport(SENT);
    await runTick(clock, { transport, scheduledTime: HOURLY_TICK });
    expect(transport.calls).toHaveLength(0);
    expect(await count('audit_log', "action = 'post.restore'")).toBe(1);
  });

  it('is not put back by the next tick or the hourly sweep, but a new sent publication archives it again', async () => {
    const seeded = await seedSentPost(api, clock);
    const archived = await getPost(api, seeded.postId);
    clock.advance(MINUTE);
    expect((await restore(archived.id, archived.revision)).status).toBe(200);

    clock.advance(MINUTE);
    await runTick(clock, { scheduledTime: MINUTE_TICK });
    await runTick(clock, { scheduledTime: HOURLY_TICK });
    expect((await getPost(api, archived.id)).archivedAt).toBeNull();

    clock.advance(MINUTE);
    const again = await seedPublication(api, {
      postId: archived.id,
      revision: archived.revision,
      destinationId: seeded.destinationId,
      scheduledAt: isoAt(clock.now())
    });
    await runTick(clock);

    expect((await jobOf(again.id)).status).toBe('succeeded');
    expect((await getPost(api, archived.id)).archivedAt).toBe(isoAt(clock.now()));
  });

  it('a restored post whose only new publication is cancelled stays live', async () => {
    const seeded = await seedSentPost(api, clock);
    const archived = await getPost(api, seeded.postId);
    clock.advance(MINUTE);
    await restore(archived.id, archived.revision);
    const next = await seedPublication(api, {
      postId: archived.id,
      revision: archived.revision,
      destinationId: seeded.destinationId,
      scheduledAt: isoAt(clock.now() + 60 * MINUTE)
    });
    await api.request(`/api/v1/publications/${next.id}/cancel`, { method: 'POST', json: { revision: 0 } });

    await runTick(clock, { scheduledTime: HOURLY_TICK });

    expect((await getPost(api, archived.id)).archivedAt).toBeNull();
  });

  it('refuses a post that is not archived, a stale revision and an unknown post, and changes nothing', async () => {
    const live = await seedApprovedPost(api);
    const seeded = await seedSentPost(api, clock);

    await expectError(await restore(live.id, live.revision), 409, 'CONFLICT', { reason: 'NOT_ARCHIVED' });
    await expectError(await restore(seeded.postId, 7), 409, 'CONFLICT', { reason: 'STALE_REVISION' });
    await expectError(await restore(crypto.randomUUID(), 0), 404, 'NOT_FOUND');
    await expectError(await restore('nope', 0), 404, 'NOT_FOUND');

    expect((await postRow(seeded.postId))?.archived_at).toBe(START);
    expect(await count('audit_log', "action = 'post.restore'")).toBe(0);
  });

  it('a second restore of the same post is refused and writes nothing', async () => {
    const seeded = await seedSentPost(api, clock);
    expect((await restore(seeded.postId, 1)).status).toBe(200);

    await expectError(await restore(seeded.postId, 1), 409, 'CONFLICT', { reason: 'NOT_ARCHIVED' });

    expect(await count('audit_log', "action = 'post.restore'")).toBe(1);
  });

  it('bulk restore reports each post: restored, not archived, stale, missing', async () => {
    const a = await seedSentPost(api, clock, 'A');
    const b = await seedSentPost(api, clock, 'B');
    const live = await seedApprovedPost(api, 'Live');
    const missing = crypto.randomUUID();

    const response = await api.request('/api/v1/posts/restore', {
      method: 'POST',
      json: {
        items: [
          { id: a.postId, revision: 1 },
          { id: live.id, revision: live.revision },
          { id: b.postId, revision: 4 },
          { id: missing, revision: 0 }
        ]
      }
    });

    expect(response.status).toBe(200);
    expect(bulkRestorePostsResultSchema.parse(await response.json()).items).toEqual([
      { id: a.postId, outcome: 'restored' },
      { id: live.id, outcome: 'refused', reason: 'NOT_ARCHIVED' },
      { id: b.postId, outcome: 'refused', reason: 'STALE_REVISION' },
      { id: missing, outcome: 'refused', reason: 'NOT_FOUND' }
    ]);
    expect((await list()).archivedCount).toBe(1);
  });

  it.each([
    ['no items', { items: [] }],
    ['101 items', { items: Array.from({ length: 101 }, () => ({ id: crypto.randomUUID(), revision: 0 })) }],
    ['a missing revision', { items: [{ id: crypto.randomUUID() }] }]
  ])('bulk restore rejects %s', async (_name, json) => {
    await expectError(await api.request('/api/v1/posts/restore', { method: 'POST', json }), 400, 'VALIDATION_ERROR');
  });

  it('bulk restore rejects a repeated id and a missing session', async () => {
    const id = crypto.randomUUID();
    await expectError(
      await api.request('/api/v1/posts/restore', {
        method: 'POST',
        json: {
          items: [
            { id, revision: 0 },
            { id, revision: 0 }
          ]
        }
      }),
      400,
      'VALIDATION_ERROR',
      { reason: 'DUPLICATE_IDS' }
    );
    await expectError(
      await api.request('/api/v1/posts/restore', { method: 'POST', json: { items: [] }, token: null }),
      401,
      'UNAUTHORIZED'
    );
    await expectError(
      await api.request(`/api/v1/posts/${id}/restore`, { method: 'POST', json: { revision: 0 }, token: null }),
      401,
      'UNAUTHORIZED'
    );
  });
});

async function seedArchived(offsetMs: number): Promise<{ postId: string; publicationId: string; jobId: string }> {
  const seeded = await seedSentPost(api, clock);
  await testDb()
    .prepare('UPDATE posts SET archived_at = ?1 WHERE id = ?2')
    .bind(clock.now() + offsetMs, seeded.postId)
    .run();
  return seeded;
}

describe('the Cron purge', () => {
  it('keeps a post until 30 days after archivedAt, then deletes it with its publication records, and never calls Telegram', async () => {
    const seeded = await seedSentPost(api, clock);
    const attemptsBefore = await count('job_attempts');
    expect(attemptsBefore).toBe(1);

    clock.set(START + ARCHIVE_RETENTION_MS - 1);
    const early = fakeTransport(SENT);
    await runTick(clock, { transport: early, scheduledTime: PURGE_TICK });
    expect(await postRow(seeded.postId)).not.toBeNull();

    clock.set(START + ARCHIVE_RETENTION_MS);
    const transport = fakeTransport(SENT);
    const tick = makeTick({ clock, transport, scheduledTime: PURGE_TICK });
    await tick.run();

    expect(tickCount(tick, 'purgedPosts')).toBe(1);
    expect(await tableCounts()).toEqual({
      posts: 0,
      post_revisions: 0,
      publications: 0,
      jobs: 0,
      job_attempts: 0,
      incidents: 0
    });
    expect(transport.calls).toHaveLength(0);
    const audit = await testDb()
      .prepare("SELECT actor_telegram_id, entity_id FROM audit_log WHERE action = 'post.purge'")
      .all();
    expect(audit.results).toEqual([{ actor_telegram_id: 'system', entity_id: seeded.postId }]);
  });

  it('purges only on the tick of minute 30', async () => {
    const seeded = await seedSentPost(api, clock);
    clock.set(START + ARCHIVE_RETENTION_MS + DAY);

    await runTick(clock, { scheduledTime: MINUTE_TICK });
    await runTick(clock, { scheduledTime: HOURLY_TICK });
    expect(await postRow(seeded.postId)).not.toBeNull();

    await runTick(clock, { scheduledTime: PURGE_TICK });
    expect(await postRow(seeded.postId)).toBeNull();
  });

  it('a busy minute-30 tick defers the purge to the next hour', async () => {
    const expired = await seedArchived(0);
    clock.set(START + ARCHIVE_RETENTION_MS + DAY);
    const due = await seedDueJob(api);

    const busy = makeTick({ clock, transport: fakeTransport(SENT), scheduledTime: PURGE_TICK });
    await busy.run();
    expect(tickCount(busy, 'due')).toBe(1);
    expect(await postRow(expired.postId)).not.toBeNull();
    expect((await jobOf(due.publicationId)).status).toBe('succeeded');

    await runTick(clock, { scheduledTime: PURGE_TICK + 60 * MINUTE });
    expect(await postRow(expired.postId)).toBeNull();
  });

  it('never deletes a post with an unknown or in-flight publication, and the rest of the batch still goes', async () => {
    const unknown = await seedArchived(0);
    const sending = await seedArchived(0);
    const plain = await seedArchived(0);
    await setJob(unknown.publicationId, "status = 'unknown', send_started_at = ?2", START);
    await testDb()
      .prepare(
        `INSERT INTO incidents (id, kind, publication_id, job_id, code, created_at) VALUES (?1, 'publish_unknown', ?2, ?3, 'SEND_UNCONFIRMED', ?4)`
      )
      .bind(crypto.randomUUID(), unknown.publicationId, unknown.jobId, START)
      .run();
    await setJob(
      sending.publicationId,
      "status = 'claimed', lease_until = ?2, send_started_at = ?3",
      START + 10 * DAY * 5,
      START
    );
    clock.set(START + ARCHIVE_RETENTION_MS + DAY);

    await runTick(clock, { scheduledTime: PURGE_TICK });

    expect(await postRow(plain.postId)).toBeNull();
    expect(await postRow(unknown.postId)).not.toBeNull();
    expect(await postRow(sending.postId)).not.toBeNull();
    expect((await jobOf(unknown.publicationId)).status).toBe('unknown');
    expect(await count('incidents')).toBe(1);
    expect(await count('audit_log', "action = 'post.purge'")).toBe(1);
  });

  it('takes a bounded batch per tick and finishes the rest on the next one', async () => {
    const db = testDb();
    const total = 55;
    await db.batch(
      Array.from({ length: total }, (_, index) =>
        db
          .prepare(
            `INSERT INTO posts (id, title, body, status, revision, archived_at, created_at, updated_at) VALUES (?1, 'T', '', 'approved', 1, ?2, ?2, ?2)`
          )
          .bind(crypto.randomUUID(), START + index)
      )
    );
    clock.set(START + ARCHIVE_RETENTION_MS + DAY);

    await runTick(clock, { scheduledTime: PURGE_TICK });
    expect(await count('posts')).toBe(5);

    await runTick(clock, { scheduledTime: PURGE_TICK + 60 * MINUTE });
    expect(await count('posts')).toBe(0);
  });

  it('two overlapping purge ticks delete the post once', async () => {
    const seeded = await seedSentPost(api, clock);
    clock.set(START + ARCHIVE_RETENTION_MS);

    const first = makeTick({ clock, transport: fakeTransport(SENT), scheduledTime: PURGE_TICK });
    const second = makeTick({ clock, transport: fakeTransport(SENT), scheduledTime: PURGE_TICK });
    await Promise.all([first.run(), second.run()]);

    expect(await postRow(seeded.postId)).toBeNull();
    expect(await count('audit_log', "action = 'post.purge'")).toBe(1);
    expect(tickCount(first, 'purgedPosts') + tickCount(second, 'purgedPosts')).toBe(1);
  });

  it('skips a post that was restored between the read and the delete', async () => {
    const seeded = await seedSentPost(api, clock);
    clock.set(START + ARCHIVE_RETENTION_MS);

    const tick = makeTick({
      clock,
      transport: fakeTransport(SENT),
      scheduledTime: PURGE_TICK,
      tweak: (container) => ({
        ...container,
        lifecycle: {
          ...container.lifecycle,
          purgePosts: async (input) => {
            const response = await restore(seeded.postId, 1);
            expect(response.status).toBe(200);
            return container.lifecycle.purgePosts(input);
          }
        }
      })
    });
    await tick.run();

    expect(await postRow(seeded.postId)).not.toBeNull();
    expect(tickCount(tick, 'purgedPosts')).toBe(0);
    expect(await count('audit_log', "action = 'post.purge'")).toBe(0);
  });

  it('a restore shortly before the deadline keeps the post for good', async () => {
    const seeded = await seedSentPost(api, clock);
    clock.set(START + ARCHIVE_RETENTION_MS - MINUTE);
    expect((await restore(seeded.postId, 1)).status).toBe(200);

    clock.set(START + ARCHIVE_RETENTION_MS + DAY);
    await runTick(clock, { scheduledTime: PURGE_TICK });

    expect(await postRow(seeded.postId)).not.toBeNull();
  });
});

describe('contract of the archive fields', () => {
  it('every post of both views parses with the schema', async () => {
    await seedSentPost(api, clock);
    await seedApprovedPost(api);
    const pages: PostDto[] = [...(await list()).items, ...(await list('?view=archive')).items];

    expect(pages.map((post) => postSchema.safeParse(post).success)).toEqual([true, true]);
  });
});

describe('the one-time backfill of migration 0008', () => {
  // The statements are taken from the migration itself, so the test cannot drift from what is applied.
  async function runBackfill(): Promise<{ before: number; after: number }> {
    const migration = env.TEST_MIGRATIONS.find((entry) => entry.name.startsWith('0008_'));
    const withoutComments = (query: string) =>
      query
        .split('\n')
        .filter((line) => !line.trim().startsWith('--'))
        .join('\n')
        .trim();
    const statements = (migration?.queries ?? [])
      .map(withoutComments)
      .filter((query) => /^(INSERT INTO audit_log|UPDATE posts)/.test(query));
    expect(statements).toHaveLength(2);
    const before = Math.floor(Date.now() / 1000) * 1000;
    await testDb().batch(statements.map((query) => testDb().prepare(query)));
    return { before, after: Date.now() };
  }

  // What a database looks like before the release: sent posts that were never archived.
  async function unarchive(): Promise<void> {
    await testDb().prepare('UPDATE posts SET archived_at = NULL').run();
    await testDb().prepare("DELETE FROM audit_log WHERE action = 'post.archive'").run();
  }

  it('archives a post sent long ago with the retention clock starting when the migration is applied, and leaves the rest', async () => {
    const old = await seedSentPost(api, clock, 'Old');
    const withUnknown = await seedSentPost(api, clock, 'Sent and unknown');
    const withWaiting = await seedSentPost(api, clock, 'Sent and waiting');
    const failedOnly = await seedDueJob(api);
    const withRetry = await seedSentPost(api, clock, 'Sent and retrying');
    await unarchive();
    // Sent a year ago: far outside any lookback window of the Cron step.
    await testDb()
      .prepare('UPDATE jobs SET updated_at = ?1')
      .bind(START - 365 * DAY)
      .run();
    const addJob = async (postId: string, set: string) => {
      const post = await getPost(api, postId);
      const extra = await addScheduled(api, postId, post.revision, START + 60 * MINUTE);
      await setJob(extra.id, set);
    };
    await addJob(withUnknown.postId, "status = 'unknown', send_started_at = 1");
    await addJob(withWaiting.postId, "status = 'pending'");
    await addJob(withRetry.postId, "status = 'retry_wait'");
    await setJob(failedOnly.publicationId, "status = 'failed'");

    const { before, after } = await runBackfill();

    const archived = await postRow(old.postId);
    expect(archived?.archived_at).toBeGreaterThanOrEqual(before);
    expect(archived?.archived_at).toBeLessThanOrEqual(after);
    const dto = await getPost(api, old.postId);
    expect(dto.archivedAt).toBe(isoAt(archived?.archived_at ?? 0));
    expect(dto.autoDeleteAt).toBe(isoAt((archived?.archived_at ?? 0) + ARCHIVE_RETENTION_MS));
    for (const id of [withUnknown.postId, withWaiting.postId, failedOnly.postId, withRetry.postId]) {
      expect((await postRow(id))?.archived_at).toBeNull();
    }
    expect(await count('audit_log', 'action = \'post.archive\' AND details = \'{"reason":"backfill"}\'')).toBe(1);
    expect((await list('?view=archive')).items.map((post) => post.id)).toEqual([old.postId]);
  });

  it('is repeatable: a second run changes nothing', async () => {
    const old = await seedSentPost(api, clock);
    await unarchive();
    await runBackfill();
    const first = (await postRow(old.postId))?.archived_at;

    await runBackfill();

    expect((await postRow(old.postId))?.archived_at).toBe(first);
    expect(await count('audit_log', "action = 'post.archive'")).toBe(1);
  });
});
