import { apiErrorSchema, type PostPoll, postSchema } from '@alexeev/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { createD1PostRepository } from '../../src/modules/content';
import { testDb } from '../helpers/db';
import { type Api, createApi, fakeClock, OWNER_TOKEN, resetDb, seedSession, START } from '../helpers/harness';

let api: Api;
let keyCounter = 0;

beforeEach(async () => {
  await resetDb();
  await seedSession({ token: OWNER_TOKEN, expiresAt: START + 7 * 24 * 60 * 60 * 1000 });
  keyCounter = 0;
  api = createApi({ clock: fakeClock() });
});

const poll: PostPoll = {
  question: 'Which hero?',
  options: ['Axe', 'Lina'],
  allowsMultipleAnswers: false,
  shuffleOptions: false,
  pictureInPoll: false,
  quiz: { correctOptionIndex: 1, explanation: 'Lina it is' }
};

const create = (json: unknown) =>
  api.request('/api/v1/posts', { method: 'POST', headers: { 'idempotency-key': `poll-${++keyCounter}` }, json });
const patch = (id: string, json: unknown) => api.request(`/api/v1/posts/${id}`, { method: 'PATCH', json });
const approve = (id: string, revision: number) =>
  api.request(`/api/v1/posts/${id}/approve`, { method: 'POST', json: { revision } });
const toDraft = (id: string, revision: number) =>
  api.request(`/api/v1/posts/${id}/draft`, { method: 'POST', json: { revision } });

async function createPoll(input: object = { kind: 'poll', poll }) {
  const response = await create(input);
  expect(response.status).toBe(201);
  return postSchema.parse(await response.json());
}

async function expectRefusal(response: Response, details: Record<string, string>) {
  expect(response.status).toBe(400);
  const body = apiErrorSchema.parse(await response.json());
  expect(body.error.code).toBe('VALIDATION_ERROR');
  expect(body.error.requestId).toBe(response.headers.get('x-request-id'));
  expect(body.error.details).toMatchObject(details);
}

describe('poll posts', () => {
  it('creates a poll post named after its question, with revision 0 carrying the poll', async () => {
    const post = await createPoll();
    expect(post).toMatchObject({ kind: 'poll', poll, title: 'Which hero?', body: '' });
    expect(post.sendOptions).toEqual({ silent: false, protectContent: false, linkPreview: false });
    const stored = await createD1PostRepository(testDb()).findRevision(post.id, 0);
    expect(stored).toMatchObject({ kind: 'poll', poll });
  });

  it('defaults a new poll to the empty draft poll', async () => {
    const post = await createPoll({ kind: 'poll' });
    expect(post.poll).toEqual({
      question: '',
      options: ['', ''],
      allowsMultipleAnswers: false,
      quiz: null,
      shuffleOptions: false,
      pictureInPoll: false
    });
  });

  it('refuses text on a poll, a poll on a text post, and media on a poll', async () => {
    await expectRefusal(await create({ kind: 'poll', body: 'text' }), { reason: 'KIND_MISMATCH' });
    await expectRefusal(await create({ kind: 'text', poll }), { reason: 'KIND_MISMATCH' });

    const pollPost = await createPoll();
    await expectRefusal(await patch(pollPost.id, { revision: 0, body: 'x', entities: [] }), {
      reason: 'KIND_MISMATCH'
    });
    const textPost = postSchema.parse(await (await create({ body: 'hi' })).json());
    await expectRefusal(await patch(textPost.id, { revision: 0, poll }), { reason: 'KIND_MISMATCH' });

    // A minimal PNG header (2x3): enough for the upload to reach the post-state check.
    const bytes = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 2, 0, 0, 0, 3, 8, 2,
      0, 0, 0, 0, 0, 0, 0
    ]);
    const upload = await api.request(`/api/v1/posts/${pollPost.id}/media?revision=0&fileName=a.png`, {
      method: 'POST',
      headers: { 'idempotency-key': 'm-1', 'content-type': 'image/png', 'content-length': String(bytes.byteLength) },
      body: bytes
    });
    await expectRefusal(upload, { reason: 'KIND_MISMATCH' });
  });

  it('lets a poll with its picture inside take exactly one photo', async () => {
    const pollPost = await createPoll({ kind: 'poll', poll: { ...poll, pictureInPoll: true } });
    const bytes = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 2, 0, 0, 0, 3, 8, 2,
      0, 0, 0, 0, 0, 0, 0
    ]);
    const upload = (revision: number, key: string) =>
      api.request(`/api/v1/posts/${pollPost.id}/media?revision=${revision}&fileName=a.png`, {
        method: 'POST',
        headers: { 'idempotency-key': key, 'content-type': 'image/png', 'content-length': String(bytes.byteLength) },
        body: bytes
      });
    const first = await upload(0, 'pp-1');
    expect(first.status).toBe(201);
    const second = await upload(1, 'pp-2');
    expect(second.status).toBe(413);
  });

  it('approves only a complete poll and names the first issue otherwise', async () => {
    const empty = await createPoll({ kind: 'poll' });
    await expectRefusal(await approve(empty.id, 0), { reason: 'POLL_INVALID', issue: 'QUESTION_EMPTY' });

    const quizWithoutAnswer = await createPoll({
      kind: 'poll',
      poll: { ...poll, quiz: { correctOptionIndex: 5, explanation: '' } }
    });
    await expectRefusal(await approve(quizWithoutAnswer.id, 0), {
      reason: 'POLL_INVALID',
      issue: 'QUIZ_ANSWER_MISSING'
    });
    expect(
      await testDb().prepare("SELECT count(*) AS n FROM posts WHERE status = 'approved'").first<{ n: number }>()
    ).toEqual({ n: 0 });
  });

  it('snapshots poll and send options per revision: editing after return-to-draft leaves the approved one intact', async () => {
    const repo = createD1PostRepository(testDb());
    const draft = await createPoll({
      kind: 'poll',
      poll,
      sendOptions: { silent: true, protectContent: true, linkPreview: true }
    });

    const approvedResponse = await approve(draft.id, 0);
    expect(approvedResponse.status).toBe(200);
    const approved = postSchema.parse(await approvedResponse.json());
    expect(approved.revision).toBe(1);
    expect(await repo.findRevision(draft.id, 1)).toMatchObject({
      kind: 'poll',
      poll,
      sendOptions: { silent: true, protectContent: true, linkPreview: true }
    });

    const back = postSchema.parse(await (await toDraft(draft.id, 1)).json());
    const changed: PostPoll = { ...poll, question: 'Which item?', options: ['BKB', 'Blink', 'Aghs'], quiz: null };
    const edited = await patch(back.id, {
      revision: back.revision,
      poll: changed,
      sendOptions: { silent: false, protectContent: false, linkPreview: false }
    });
    expect(edited.status).toBe(200);
    const editedPost = postSchema.parse(await edited.json());
    expect(editedPost).toMatchObject({ title: 'Which item?', poll: changed });

    expect(await repo.findRevision(draft.id, 1)).toMatchObject({
      poll,
      sendOptions: { silent: true, protectContent: true, linkPreview: true }
    });
    expect(await repo.findRevision(draft.id, editedPost.revision)).toMatchObject({
      poll: changed,
      sendOptions: { silent: false, protectContent: false, linkPreview: false }
    });
    expect(await repo.findRevision(draft.id, back.revision)).toMatchObject({ poll });
  });

  it('keeps send options on a text post through approve', async () => {
    const repo = createD1PostRepository(testDb());
    const post = postSchema.parse(await (await create({ body: 'hi' })).json());
    const edited = postSchema.parse(
      await (
        await patch(post.id, { revision: 0, sendOptions: { silent: true, protectContent: false, linkPreview: false } })
      ).json()
    );
    const approved = postSchema.parse(await (await approve(post.id, edited.revision)).json());
    expect(await repo.findRevision(post.id, approved.revision)).toMatchObject({
      kind: 'text',
      poll: null,
      sendOptions: { silent: true, protectContent: false, linkPreview: false }
    });
  });
});
