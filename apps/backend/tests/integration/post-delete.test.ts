import {
  bulkDeletePostsResultSchema,
  deletePostResultSchema,
  postPageSchema,
  postSchema,
  publicationSchema
} from '@alexeev/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { createContainer } from '../../src/app/container';
import { testDb } from '../helpers/db';
import { fakeTransport, isoAt, makeTick, SENT, seedDueJob } from '../helpers/dispatch';
import { expectError } from '../helpers/expect-error';
import {
  type Api,
  createApi,
  fakeClock,
  type FakeClock,
  OWNER_ID,
  OWNER_TOKEN,
  resetDb,
  seedSession,
  START
} from '../helpers/harness';
import { addScheduled, DAY, getPost, postRow, seedSentPost, setJob, tableCounts } from '../helpers/lifecycle';
import {
  claimJob,
  count,
  jobOf,
  seedApprovedPost,
  seedDestination,
  seedDraftPost,
  seedPublication
} from '../helpers/publishing';

let clock: FakeClock;
let api: Api;

beforeEach(async () => {
  await resetDb();
  await seedSession({ token: OWNER_TOKEN, expiresAt: START + 400 * DAY });
  clock = fakeClock();
  api = createApi({ clock });
});

const del = (id: string, revision: number) =>
  api.request(`/api/v1/posts/${id}/delete`, { method: 'POST', json: { revision } });
const delBulk = (items: unknown) => api.request('/api/v1/posts/delete', { method: 'POST', json: { items } });

async function bulk(items: { id: string; revision: number }[]) {
  const response = await delBulk(items);
  expect(response.status).toBe(200);
  return bulkDeletePostsResultSchema.parse(await response.json()).items;
}

const LEASE = START + 120_000;
const SENDING = {
  set: "status = 'claimed', attempts = 1, lease_until = ?2, send_started_at = ?3",
  bindings: [LEASE, START]
};
const PREPARING = { set: "status = 'claimed', attempts = 1, lease_until = ?2", bindings: [LEASE] };
const UNKNOWN = { set: "status = 'unknown', attempts = 1, send_started_at = ?2", bindings: [START] };

describe('POST /api/v1/posts/{id}/delete', () => {
  it('removes a draft with its revisions and writes an audit row (a replay finds nothing and writes nothing)', async () => {
    const draft = await seedDraftPost(api);

    const response = await del(draft.id, draft.revision);

    expect(response.status).toBe(200);
    expect(deletePostResultSchema.parse(await response.json())).toEqual({ id: draft.id, cancelledPublications: [] });
    expect(await postRow(draft.id)).toBeNull();
    expect(await count('post_revisions', `post_id = '${draft.id}'`)).toBe(0);
    const audit = await testDb()
      .prepare("SELECT actor_telegram_id, entity_id, details FROM audit_log WHERE action = 'post.delete'")
      .all();
    expect(audit.results).toEqual([
      {
        actor_telegram_id: OWNER_ID,
        entity_id: draft.id,
        details: '{"revision":0,"soft":0,"cancelledPublications":0,"removedPublications":0}'
      }
    ]);

    await expectError(await del(draft.id, draft.revision), 404, 'NOT_FOUND');
    expect(await count('audit_log', "action = 'post.delete'")).toBe(1);
    await expectError(await api.request(`/api/v1/posts/${draft.id}`), 404, 'NOT_FOUND');
  });

  it('removes an approved post that nobody scheduled', async () => {
    const post = await seedApprovedPost(api);

    expect((await del(post.id, post.revision)).status).toBe(200);

    expect(await postRow(post.id)).toBeNull();
    expect(await count('post_revisions')).toBe(0);
  });

  it('cancels waiting publications in the same write: nothing is left to send and the response names them', async () => {
    const post = await seedApprovedPost(api);
    const first = await seedDestination(api, { title: 'First' });
    const second = await seedDestination(api, { title: 'Second' });
    const soon = await seedPublication(api, {
      postId: post.id,
      revision: post.revision,
      destinationId: first.id,
      scheduledAt: isoAt(START + 60 * 60_000)
    });
    const later = await seedPublication(api, {
      postId: post.id,
      revision: post.revision,
      destinationId: second.id,
      scheduledAt: isoAt(START + 2 * 60 * 60_000)
    });
    // One of them is already waiting for a retry: still cancellable.
    await setJob(later.id, "status = 'retry_wait', attempts = 1");

    const response = await del(post.id, post.revision);

    expect(response.status).toBe(200);
    const result = deletePostResultSchema.parse(await response.json());
    expect(result.cancelledPublications).toEqual([
      { id: soon.id, destinationId: first.id, scheduledAt: soon.scheduledAt },
      { id: later.id, destinationId: second.id, scheduledAt: later.scheduledAt }
    ]);
    expect(await tableCounts()).toMatchObject({ posts: 0, post_revisions: 0, publications: 0, jobs: 0 });
    expect(await count('audit_log', `action = 'post.delete' AND details LIKE '%"cancelledPublications":2%'`)).toBe(1);
    // The publication is gone, not just cancelled.
    await expectError(await api.request(`/api/v1/publications/${soon.id}`), 404, 'NOT_FOUND');

    clock.advance(3 * 60 * 60_000);
    const transport = fakeTransport(SENT);
    await makeTick({ clock, transport }).run();
    expect(transport.calls).toHaveLength(0);
  });

  it('keeps the sent publication with its attempts and incidents, and hides the post (a tombstone)', async () => {
    const sent = await seedSentPost(api, clock);
    const failed = await seedDueJob(api);
    expect(await count('job_attempts')).toBe(1);
    await testDb()
      .prepare(
        `INSERT INTO incidents (id, kind, publication_id, job_id, code, created_at) VALUES (?1, 'publish_failed', ?2, ?3, 'X', ?4)`
      )
      .bind(crypto.randomUUID(), sent.publicationId, sent.jobId, START)
      .run();
    const post = await getPost(api, sent.postId);

    expect((await del(post.id, post.revision)).status).toBe(200);

    expect(await tableCounts()).toMatchObject({
      posts: 2,
      post_revisions: 3,
      publications: 2,
      jobs: 2,
      job_attempts: 1,
      incidents: 1
    });
    expect(await count('posts', `id = '${sent.postId}' AND deleted_at IS NOT NULL`)).toBe(1);
    // The other post and its publication are untouched.
    expect(await jobOf(failed.publicationId)).toMatchObject({ status: 'pending' });
    expect(await count('audit_log', `action = 'post.delete' AND details LIKE '%"soft":1%'`)).toBe(1);
  });

  it('hard-deletes the tombstone with its revisions once its last sent publication is deleted', async () => {
    const sent = await seedSentPost(api, clock);
    const post = await getPost(api, sent.postId);
    expect((await del(post.id, post.revision)).status).toBe(200);
    expect(await count('posts', `id = '${sent.postId}' AND deleted_at IS NOT NULL`)).toBe(1);
    const publication = await testDb()
      .prepare('SELECT revision FROM publications WHERE id = ?1')
      .bind(sent.publicationId)
      .first<{ revision: number }>();

    const response = await api.request(`/api/v1/publications/${sent.publicationId}/delete`, {
      method: 'POST',
      json: { revision: publication?.revision }
    });

    expect(response.status).toBe(200);
    expect(await postRow(sent.postId)).toBeNull();
    expect(await count('post_revisions', `post_id = '${sent.postId}'`)).toBe(0);
    expect(await count('publications', `id = '${sent.publicationId}'`)).toBe(0);
  });

  it.each([
    ['being prepared', PREPARING, 'PUBLICATION_IN_PROGRESS'],
    ['being sent', SENDING, 'PUBLICATION_IN_PROGRESS'],
    ['unknown', UNKNOWN, 'PUBLICATION_UNKNOWN']
  ])('refuses with 409 while a publication is %s, and removes nothing', async (_name, state, reason) => {
    const seeded = await seedDueJob(api);
    // A second, waiting publication must not be cancelled by a refused delete.
    const post = await getPost(api, seeded.postId);
    const waiting = await addScheduled(api, post.id, post.revision, START + 60 * 60_000);
    await setJob(seeded.publicationId, state.set, ...state.bindings);
    const before = await tableCounts();

    const response = await del(post.id, post.revision);

    await expectError(response, 409, 'CONFLICT', { reason, publicationId: seeded.publicationId });
    expect(await tableCounts()).toEqual(before);
    expect((await jobOf(waiting.id)).status).toBe('pending');
    expect(await count('audit_log', "action = 'post.delete'")).toBe(0);
  });

  it('says what a publication is doing before it says the revision is stale', async () => {
    const seeded = await seedDueJob(api);
    await setJob(seeded.publicationId, SENDING.set, ...SENDING.bindings);

    await expectError(await del(seeded.postId, 99), 409, 'CONFLICT', { reason: 'PUBLICATION_IN_PROGRESS' });
  });

  it('refuses a stale revision and an unknown post', async () => {
    const draft = await seedDraftPost(api);

    await expectError(await del(draft.id, 5), 409, 'CONFLICT', { reason: 'STALE_REVISION' });
    expect(await postRow(draft.id)).not.toBeNull();
    await expectError(await del(crypto.randomUUID(), 0), 404, 'NOT_FOUND');
    await expectError(await del('not-a-uuid', 0), 404, 'NOT_FOUND');
  });

  it('rejects a bad body and a missing session', async () => {
    const draft = await seedDraftPost(api);

    await expectError(
      await api.request(`/api/v1/posts/${draft.id}/delete`, { method: 'POST', json: {} }),
      400,
      'VALIDATION_ERROR'
    );
    await expectError(
      await api.request(`/api/v1/posts/${draft.id}/delete`, { method: 'POST', json: { revision: 0, force: true } }),
      400,
      'VALIDATION_ERROR'
    );
    await expectError(
      await api.request(`/api/v1/posts/${draft.id}/delete`, { method: 'POST', body: 'x' }),
      400,
      'VALIDATION_ERROR'
    );
    await expectError(
      await api.request(`/api/v1/posts/${draft.id}/delete`, { method: 'POST', json: { revision: 0 }, token: null }),
      401,
      'UNAUTHORIZED'
    );
    expect(await postRow(draft.id)).not.toBeNull();
  });
});

describe('a deleted post that was sent stays in the publications history', () => {
  it('the publication keeps the sent snapshot with postDeleted; the post disappears from every post view', async () => {
    const sent = await seedSentPost(api, clock);
    const post = await getPost(api, sent.postId);
    expect((await del(post.id, post.revision)).status).toBe(200);

    const detail = publicationSchema.parse(
      await (await api.request(`/api/v1/publications/${sent.publicationId}`)).json()
    );
    expect(detail).toMatchObject({
      id: sent.publicationId,
      status: 'sent',
      postDeleted: true,
      postSnapshot: { title: post.title, body: post.body, entities: [], media: [] }
    });
    expect(detail.externalMessageId).toBeDefined();
    const list = (await (await api.request('/api/v1/publications?limit=50')).json()) as { items: { id: string }[] };
    expect(list.items.map((item) => item.id)).toEqual([sent.publicationId]);

    await expectError(await api.request(`/api/v1/posts/${post.id}`), 404, 'NOT_FOUND');
    for (const view of ['live', 'archive']) {
      const page = postPageSchema.parse(await (await api.request(`/api/v1/posts?view=${view}`)).json());
      expect(page).toMatchObject({ items: [], archivedCount: 0 });
    }
    expect(postPageSchema.parse(await (await api.request('/api/v1/posts?q=Sent+post')).json()).items).toEqual([]);
    await expectError(await del(post.id, post.revision), 404, 'NOT_FOUND');
    await expectError(
      await api.request(`/api/v1/posts/${post.id}/restore`, { method: 'POST', json: { revision: post.revision } }),
      404,
      'NOT_FOUND'
    );
    expect(await count('audit_log', "action = 'post.delete'")).toBe(1);
  });

  it('an unsent post is still removed completely', async () => {
    const failed = await seedDueJob(api);
    await setJob(failed.publicationId, "status = 'failed'");

    expect((await del(failed.postId, 1)).status).toBe(200);

    expect(await count('posts', `id = '${failed.postId}'`)).toBe(0);
    expect(await count('publications', `id = '${failed.publicationId}'`)).toBe(0);
  });
});

describe('delete racing the dispatcher', () => {
  it('a job claimed first blocks the delete; the post, publication and job stay', async () => {
    const seeded = await seedDueJob(api);
    expect(await claimJob(seeded.jobId, START, START + 120_000)).toBe(1);

    await expectError(await del(seeded.postId, 1), 409, 'CONFLICT', { reason: 'PUBLICATION_IN_PROGRESS' });

    expect((await jobOf(seeded.publicationId)).status).toBe('claimed');
    expect(await postRow(seeded.postId)).not.toBeNull();
  });

  it('a delete first leaves the job nothing to claim', async () => {
    const seeded = await seedDueJob(api);

    expect((await del(seeded.postId, 1)).status).toBe(200);

    expect(await claimJob(seeded.jobId, START, START + 120_000)).toBe(0);
  });

  it.each([0, 1, 2, 3])('claim and delete issued together (%i): exactly one of them wins', async () => {
    const seeded = await seedDueJob(api);

    const [claimed, response] = await Promise.all([
      claimJob(seeded.jobId, START, START + 120_000),
      del(seeded.postId, 1)
    ]);

    if (claimed === 1) {
      expect(response.status).toBe(409);
      expect(await postRow(seeded.postId)).not.toBeNull();
      expect((await jobOf(seeded.publicationId)).status).toBe('claimed');
    } else {
      expect(response.status).toBe(200);
      expect(await postRow(seeded.postId)).toBeNull();
      expect(await count('jobs')).toBe(0);
    }
  });

  it('a delete between the due scan and the claim: the tick sends nothing', async () => {
    const seeded = await seedDueJob(api);
    const transport = fakeTransport(SENT);
    let deleted = 0;

    const tick = makeTick({
      clock,
      transport,
      tweak: (container) => ({
        ...container,
        dispatchJobs: {
          ...container.dispatchJobs,
          claim: async (jobId, now, leaseUntil) => {
            deleted = (await del(seeded.postId, 1)).status;
            return container.dispatchJobs.claim(jobId, now, leaseUntil);
          }
        }
      })
    });
    await tick.run();

    expect(deleted).toBe(200);
    expect(transport.calls).toHaveLength(0);
    expect(await count('posts')).toBe(0);
    expect(await count('job_attempts')).toBe(0);
  });

  it('a delete after the claim is refused and the send completes untouched', async () => {
    const seeded = await seedDueJob(api);
    const transport = fakeTransport(SENT);
    let status = 0;

    const tick = makeTick({
      clock,
      transport,
      tweak: (container) => ({
        ...container,
        dispatchJobs: {
          ...container.dispatchJobs,
          loadTarget: async (publicationId) => {
            status = (await del(seeded.postId, 1)).status;
            return container.dispatchJobs.loadTarget(publicationId);
          }
        }
      })
    });
    await tick.run();

    expect(status).toBe(409);
    expect(transport.calls).toHaveLength(1);
    expect((await jobOf(seeded.publicationId)).status).toBe('succeeded');
  });
});

describe('POST /api/v1/posts/delete', () => {
  it('deletes three archived posts at once; an in-flight one cannot be removed', async () => {
    const archived = [
      await seedSentPost(api, clock, 'A'),
      await seedSentPost(api, clock, 'B'),
      await seedSentPost(api, clock, 'C')
    ];
    const posts = await Promise.all(archived.map((seeded) => getPost(api, seeded.postId)));
    expect(posts.every((post) => post.archivedAt !== null)).toBe(true);
    const sending = await seedDueJob(api);
    await setJob(sending.publicationId, SENDING.set, ...SENDING.bindings);

    const items = await bulk([
      ...posts.map((post) => ({ id: post.id, revision: post.revision })),
      { id: sending.postId, revision: 1 }
    ]);

    expect(items.map((item) => item.outcome)).toEqual(['deleted', 'deleted', 'deleted', 'refused']);
    expect(items[3]).toEqual({
      id: sending.postId,
      outcome: 'refused',
      reason: 'PUBLICATION_IN_PROGRESS',
      publicationId: sending.publicationId
    });
    expect(await count('posts')).toBe(4);
    expect(await count('posts', 'deleted_at IS NOT NULL')).toBe(3);
    const page = postPageSchema.parse(await (await api.request('/api/v1/posts?view=archive')).json());
    expect(page).toMatchObject({ items: [], archivedCount: 0 });
  });

  it('decides each post on its own: a stale one, an unknown id and an unknown publication fail, the rest go, in request order', async () => {
    const draft = await seedDraftPost(api);
    const stale = await seedDraftPost(api);
    const scheduled = await seedApprovedPost(api, 'Scheduled');
    const waiting = await addScheduled(api, scheduled.id, scheduled.revision, START + 60 * 60_000);
    const unknown = await seedDueJob(api);
    await setJob(unknown.publicationId, UNKNOWN.set, ...UNKNOWN.bindings);
    const missing = crypto.randomUUID();

    const items = await bulk([
      { id: unknown.postId, revision: 1 },
      { id: draft.id, revision: draft.revision },
      { id: missing, revision: 0 },
      { id: stale.id, revision: 9 },
      { id: scheduled.id, revision: scheduled.revision }
    ]);

    expect(items).toEqual([
      { id: unknown.postId, outcome: 'refused', reason: 'PUBLICATION_UNKNOWN', publicationId: unknown.publicationId },
      { id: draft.id, outcome: 'deleted', cancelledPublications: [] },
      { id: missing, outcome: 'refused', reason: 'NOT_FOUND' },
      { id: stale.id, outcome: 'refused', reason: 'STALE_REVISION' },
      {
        id: scheduled.id,
        outcome: 'deleted',
        cancelledPublications: [
          { id: waiting.id, destinationId: waiting.destinationId, scheduledAt: isoAt(START + 60 * 60_000) }
        ]
      }
    ]);
    expect(await postRow(draft.id)).toBeNull();
    expect(await postRow(scheduled.id)).toBeNull();
    expect(await postRow(stale.id)).not.toBeNull();
    expect(await postRow(unknown.postId)).not.toBeNull();
    // The unknown publication keeps its job, so its reconciliation stays possible.
    expect((await jobOf(unknown.publicationId)).status).toBe('unknown');
    expect(await count('audit_log', "action = 'post.delete'")).toBe(2);
  });

  it('a retry of the same request reports the deleted posts as NOT_FOUND and writes nothing more', async () => {
    const drafts = [await seedDraftPost(api), await seedDraftPost(api)];
    const items = drafts.map((post) => ({ id: post.id, revision: post.revision }));
    await bulk(items);

    const retry = await bulk(items);

    expect(retry.map((item) => item.outcome === 'refused' && item.reason)).toEqual(['NOT_FOUND', 'NOT_FOUND']);
    expect(await count('audit_log', "action = 'post.delete'")).toBe(2);
  });

  it('handles the largest request in one batch', async () => {
    const ids = Array.from({ length: 100 }, () => crypto.randomUUID());
    const db = testDb();
    await db.batch(
      ids.map((id) =>
        db
          .prepare(
            `INSERT INTO posts (id, title, body, status, revision, created_at, updated_at) VALUES (?1, 'T', '', 'draft', 0, ?2, ?2)`
          )
          .bind(id, START)
      )
    );

    const items = await bulk(ids.map((id) => ({ id, revision: 0 })));

    expect(items.every((item) => item.outcome === 'deleted')).toBe(true);
    expect(await count('posts')).toBe(0);
  });

  it.each([
    ['no items', { items: [] }],
    ['101 items', { items: Array.from({ length: 101 }, () => ({ id: crypto.randomUUID(), revision: 0 })) }],
    ['an id that is not a uuid', { items: [{ id: 'x', revision: 0 }] }],
    ['a missing revision', { items: [{ id: crypto.randomUUID() }] }],
    ['an unknown key', { items: [{ id: crypto.randomUUID(), revision: 0, force: true }] }],
    ['an unknown top-level key', { items: [{ id: crypto.randomUUID(), revision: 0 }], all: true }]
  ])('rejects %s', async (_name, body) => {
    const draft = await seedDraftPost(api);

    await expectError(
      await api.request('/api/v1/posts/delete', { method: 'POST', json: body }),
      400,
      'VALIDATION_ERROR'
    );

    expect(await postRow(draft.id)).not.toBeNull();
  });

  it('rejects a repeated id with a stable reason', async () => {
    const id = crypto.randomUUID();

    await expectError(
      await delBulk([
        { id, revision: 0 },
        { id, revision: 0 }
      ]),
      400,
      'VALIDATION_ERROR',
      { reason: 'DUPLICATE_IDS' }
    );
  });

  it('needs a session', async () => {
    await expectError(
      await api.request('/api/v1/posts/delete', { method: 'POST', json: { items: [] }, token: null }),
      401,
      'UNAUTHORIZED'
    );
  });
});

describe('a failure leaves everything in place', () => {
  it('a database error is a 5xx and nothing is shown as removed', async () => {
    const draft = await seedDraftPost(api);
    const failing = new Proxy(testDb(), {
      get(target, property) {
        if (property === 'batch') return () => Promise.reject(new Error('D1 down'));
        const value = Reflect.get(target, property) as unknown;
        return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(target) : value;
      }
    });
    const container = createContainer({ DB: failing }, { clock });

    await expect(
      container.lifecycle.deletePosts({ items: [{ id: draft.id, revision: 0 }], actor: OWNER_ID, now: START })
    ).rejects.toThrow();

    expect(await postRow(draft.id)).not.toBeNull();
  });

  it('a statement that fails halfway rolls the whole delete back', async () => {
    const seeded = await seedSentPost(api, clock);
    const post = await getPost(api, seeded.postId);
    const db = testDb();
    await db
      .prepare(
        "CREATE TRIGGER block_post_delete BEFORE UPDATE OF deleted_at ON posts BEGIN SELECT RAISE(ABORT, 'boom'); END"
      )
      .run();
    try {
      const before = await tableCounts();
      const auditBefore = await count('audit_log');

      const response = await del(post.id, post.revision);

      expect(response.status).toBe(500);
      expect(await tableCounts()).toEqual(before);
      expect(await count('audit_log')).toBe(auditBefore);
    } finally {
      await db.prepare('DROP TRIGGER block_post_delete').run();
    }
  });
});

describe('contract', () => {
  it('a post DTO of the single-post and list endpoints parses with the schema', async () => {
    const post = await seedApprovedPost(api);

    const single = postSchema.parse(await (await api.request(`/api/v1/posts/${post.id}`)).json());
    const page = postPageSchema.parse(await (await api.request('/api/v1/posts')).json());

    expect(single).toEqual(page.items[0]);
    expect(publicationSchema.safeParse(single).success).toBe(false);
  });
});
