import { postSchema, returnPostToDraftRefusalSchema } from '@alexeev/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { testDb } from '../helpers/db';
import { expectError } from '../helpers/expect-error';
import { type Api, createApi, fakeClock, OWNER_TOKEN, resetDb, seedSession, START } from '../helpers/harness';
import { getPost, postRow, seedSentPost, setJob, tableCounts } from '../helpers/lifecycle';
import { count, jobOf, seedApprovedPost, seedDestination, seedDraftPost, seedPublication } from '../helpers/publishing';

let api: Api;

beforeEach(async () => {
  await resetDb();
  await seedSession({ token: OWNER_TOKEN, expiresAt: START + 400 * 24 * 60 * 60_000 });
  api = createApi({ clock: fakeClock() });
});

const returnToDraft = (id: string, revision: number) =>
  api.request(`/api/v1/posts/${id}/draft`, { method: 'POST', json: { revision } });

describe('POST /api/v1/posts/{id}/draft', () => {
  it('returns an approved post to draft, increments revision, audits and preserves final publication history', async () => {
    const sent = await seedSentPost(api, api.clock);
    const before = await getPost(api, sent.postId);
    expect(before.archivedAt).not.toBeNull();
    const historyBefore = await jobOf(sent.publicationId);
    const messageBefore = await testDb()
      .prepare('SELECT external_message_id FROM publications WHERE id = ?1')
      .bind(sent.publicationId)
      .first();

    const response = await returnToDraft(before.id, before.revision);

    expect(response.status).toBe(200);
    const result = postSchema.parse(await response.json());
    expect(result).toMatchObject({ id: before.id, status: 'draft', revision: before.revision + 1, archivedAt: null });
    expect(result.publicationSummary.counts.sent).toBe(1);
    expect(result.publicationSummary.lastSentAt).not.toBeNull();
    expect(await postRow(before.id)).toMatchObject({
      status: 'draft',
      revision: before.revision + 1,
      archived_at: null,
      restored_at: START
    });
    expect(await jobOf(sent.publicationId)).toEqual(historyBefore);
    expect(await count('publications')).toBe(1);
    expect(
      await testDb()
        .prepare('SELECT external_message_id FROM publications WHERE id = ?1')
        .bind(sent.publicationId)
        .first()
    ).toEqual(messageBefore);
    expect(await count('audit_log', "action = 'post.return_to_draft'")).toBe(1);
    expect(await count('audit_log', "action = 'post.archive'")).toBe(1);
  });

  it.each([
    ['pending', 'PUBLICATION_PENDING'],
    ['retry_wait', 'PUBLICATION_PENDING'],
    ['claimed', 'PUBLICATION_IN_PROGRESS'],
    ['unknown', 'PUBLICATION_UNKNOWN']
  ] as const)('refuses without changing history when a publication job is %s', async (status, reason) => {
    const post = await seedApprovedPost(api);
    const destination = await seedDestination(api);
    const publication = await seedPublication(api, {
      postId: post.id,
      revision: post.revision,
      destinationId: destination.id,
      scheduledAt: new Date(START + 60 * 60_000).toISOString()
    });
    if (status === 'retry_wait') await setJob(publication.id, "status = 'retry_wait', attempts = 1");
    if (status === 'claimed') await setJob(publication.id, "status = 'claimed', attempts = 1");
    if (status === 'unknown')
      await setJob(publication.id, "status = 'unknown', attempts = 1, send_started_at = ?2", START);
    const before = await tableCounts();

    await expectError(await returnToDraft(post.id, post.revision), 409, 'CONFLICT', { reason });

    expect(await tableCounts()).toEqual(before);
    expect(await postRow(post.id)).toMatchObject({ status: 'approved', revision: post.revision });
    expect((await jobOf(publication.id)).status).toBe(status);
    expect(await count('audit_log', "action = 'post.return_to_draft'")).toBe(0);
  });

  it('refuses stale, non-approved and missing posts with stable reasons', async () => {
    const approved = await seedApprovedPost(api);
    await expectError(await returnToDraft(approved.id, approved.revision - 1), 409, 'CONFLICT', {
      reason: 'STALE_REVISION'
    });
    const draft = await seedDraftPost(api);
    await expectError(await returnToDraft(draft.id, draft.revision), 409, 'CONFLICT', { reason: 'NOT_APPROVED' });
    await expectError(await returnToDraft(crypto.randomUUID(), 0), 404, 'NOT_FOUND');
    await expectError(await returnToDraft('not-a-uuid', 0), 404, 'NOT_FOUND');
    expect(returnPostToDraftRefusalSchema.parse('PUBLICATION_PENDING')).toBe('PUBLICATION_PENDING');
  });

  it('validates the body and requires an owner session', async () => {
    const post = await seedApprovedPost(api);
    await expectError(
      await api.request(`/api/v1/posts/${post.id}/draft`, { method: 'POST', json: {} }),
      400,
      'VALIDATION_ERROR'
    );
    await expectError(
      await api.request(`/api/v1/posts/${post.id}/draft`, {
        method: 'POST',
        json: { revision: post.revision, force: true }
      }),
      400,
      'VALIDATION_ERROR'
    );
    await expectError(
      await api.request(`/api/v1/posts/${post.id}/draft`, {
        method: 'POST',
        json: { revision: post.revision },
        token: null
      }),
      401,
      'UNAUTHORIZED'
    );
  });
});

describe('return to draft racing publication creation', () => {
  it.each([0, 1, 2, 3])('the atomic guard lets only a safe transition or a publication win (%i)', async () => {
    const post = await seedApprovedPost(api);
    const destination = await seedDestination(api);
    const [returned, scheduled] = await Promise.all([
      returnToDraft(post.id, post.revision),
      api.request('/api/v1/publications', {
        method: 'POST',
        headers: { 'idempotency-key': `return-race-${crypto.randomUUID()}` },
        json: {
          postId: post.id,
          revision: post.revision,
          destinationId: destination.id,
          scheduledAt: new Date(START + 60 * 60_000).toISOString(),
          timezone: 'UTC'
        }
      })
    ]);
    const state = await postRow(post.id);
    const publications = await count('publications', `post_id = '${post.id}'`);

    if (returned.status === 200) {
      expect(scheduled.status).not.toBe(202);
      expect(state).toMatchObject({ status: 'draft', revision: post.revision + 1 });
      expect(publications).toBe(0);
    } else {
      expect(scheduled.status).toBe(202);
      await expectError(returned, 409, 'CONFLICT', { reason: 'PUBLICATION_PENDING' });
      expect(state).toMatchObject({ status: 'approved', revision: post.revision });
      expect(publications).toBe(1);
    }
  });
});
