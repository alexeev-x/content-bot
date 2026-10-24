import { apiErrorSchema, postSchema, uploadPostMediaResultSchema } from '@alexeev/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import type { PublicationTransport } from '../../src/modules/publishing';
import { LEASE_MS } from '../../src/modules/publishing/domain/dispatch-policy';
import { testDb } from '../helpers/db';
import { adapterTransport, attemptsOf, grammyError, incidentsOf, makeTick, publicationOf } from '../helpers/dispatch';
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
import { jobOf, seedDestination, seedPublication } from '../helpers/publishing';

// Rich posts (migration 0103, owner 23.10.2026: every post in the approved rich format) go through the same claim, mark
// and outcome classification as any post; these prove the rich branch keeps every publishing invariant.

let clock: FakeClock;
let api: Api;
let keys = 0;

beforeEach(async () => {
  await resetDb();
  await seedSession({ token: OWNER_TOKEN, expiresAt: START + 400 * 24 * 60 * 60_000 });
  clock = fakeClock();
  api = createApi({ clock });
  keys = 0;
});

const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 2, 0, 0, 0, 3, 8, 2, 0,
  0, 0, 0, 0, 0, 0
]);

/** A draft with `media` pictures whose rich HTML is set the way the server's writers set it. */
async function richDraft(html: string, media = 0) {
  const created = await api.request('/api/v1/posts', {
    method: 'POST',
    headers: { 'idempotency-key': `rich-${++keys}` },
    json: { body: 'Вышел 7.41f' }
  });
  expect(created.status).toBe(201);
  const draft = postSchema.parse(await created.json());
  const id = draft.id;
  let revision = draft.revision;
  for (let index = 0; index < media; index += 1) {
    const upload = await api.request(`/api/v1/posts/${id}/media?revision=${revision}&fileName=p${index + 1}.png`, {
      method: 'POST',
      headers: new Headers({
        'content-type': 'image/png',
        'content-length': String(PNG.length),
        'idempotency-key': `rich-media-${++keys}`
      }),
      body: PNG
    });
    expect(upload.status).toBe(201);
    revision = uploadPostMediaResultSchema.parse(await upload.json()).revision;
  }
  await testDb().prepare('UPDATE posts SET rich_html = ?1 WHERE id = ?2').bind(html, id).run();
  return { id, revision };
}

async function dueRich(html: string, media = 0) {
  const draft = await richDraft(html, media);
  const approved = await api.request(`/api/v1/posts/${draft.id}/approve`, {
    method: 'POST',
    json: { revision: draft.revision }
  });
  expect(approved.status).toBe(200);
  const post = postSchema.parse(await approved.json());
  expect(post.richHtml).toBe(html);
  const destination = await seedDestination(api, { chatId: `-100777${keys}` });
  const publication = await seedPublication(api, {
    postId: post.id,
    revision: post.revision,
    destinationId: destination.id,
    scheduledAt: new Date(clock.now()).toISOString()
  });
  const job = await testDb()
    .prepare('SELECT id FROM jobs WHERE publication_id = ?1')
    .bind(publication.id)
    .first<{ id: string }>();
  return { postId: post.id, revision: post.revision, publicationId: publication.id, jobId: job?.id ?? '' };
}

const tick = (transport: PublicationTransport) => makeTick({ clock, transport }).run();

describe('a rich post is sent with sendRichMessage', () => {
  it('sends the approved rich HTML, uploads only the media it names, and records the message id', async () => {
    const html = '<h3>Вышел 7.41f</h3>\n<figure><img src="tg://photo?id=p2"/></figure>\n<p><b>Главное</b></p>';
    const { publicationId, jobId } = await dueRich(html, 2);
    const { transport, sender } = adapterTransport(() => Promise.resolve({ message_id: 9001, chat: { id: 1 } }));

    await tick(transport);

    expect(sender.requests).toHaveLength(1);
    expect(sender.requests[0]?.text).toBe('rich');
    const message = sender.requests[0]?.other as { html: string; media: { id: string; kind: string }[] };
    expect(message.html).toBe(html);
    expect(message.media.map(({ id, kind }) => [id, kind])).toEqual([['p2', 'photo']]);
    expect(await jobOf(publicationId)).toMatchObject({ status: 'succeeded', attempts: 1 });
    expect((await publicationOf(publicationId)).external_message_id).toBe('9001');
    expect(await attemptsOf(jobId)).toMatchObject([{ outcome: 'sent', external_message_id: '9001' }]);
  });

  it('fills the media slot from the approved media: one picture, or nothing without one', async () => {
    const { transport, sender } = adapterTransport(() => Promise.resolve({ message_id: 7, chat: { id: 1 } }));
    await dueRich('<h3>Вышел 7.41f</h3>\n{{media}}\n<p>Текст</p>', 1);
    await tick(transport);
    const withPicture = sender.requests[0]?.other as { html: string; media: { id: string }[] };
    expect(withPicture.html).toBe('<h3>Вышел 7.41f</h3>\n<figure><img src="tg://photo?id=p1"/></figure>\n<p>Текст</p>');
    expect(withPicture.media.map(({ id }) => id)).toEqual(['p1']);

    await dueRich('<h3>Вышел 7.41e</h3>\n{{media}}\n<p>Текст</p>');
    await tick(transport);
    const without = sender.requests[1]?.other as { html: string; media: unknown[] };
    expect(without.html).toBe('<h3>Вышел 7.41e</h3>\n\n<p>Текст</p>');
    expect(without.media).toEqual([]);
  });

  it('a timeout ends as unknown and no later tick sends it again', async () => {
    const { publicationId, jobId } = await dueRich('<p>Текст</p>');
    const { transport, sender } = adapterTransport(() => new Promise(() => {}), 20);

    await tick(transport);

    expect(await jobOf(publicationId)).toMatchObject({ status: 'unknown', attempts: 1 });
    expect(await incidentsOf(jobId)).toMatchObject([{ kind: 'publish_unknown' }]);
    for (let minute = 0; minute < 3; minute += 1) {
      clock.advance(LEASE_MS + 60_000);
      await tick(transport);
    }
    expect(sender.requests).toHaveLength(1);
    expect((await jobOf(publicationId)).status).toBe('unknown');
  });

  it('Telegram refusing the markup (400) fails it as CONTENT_INVALID, never retried', async () => {
    const { publicationId, jobId } = await dueRich('<p>Текст</p>');
    const { transport, sender } = adapterTransport(() =>
      Promise.reject(grammyError(400, 'Bad Request: rich message is invalid'))
    );

    await tick(transport);
    clock.advance(24 * 60 * 60_000);
    await tick(transport);

    expect(sender.requests).toHaveLength(1);
    expect(await jobOf(publicationId)).toMatchObject({ status: 'failed' });
    expect(await attemptsOf(jobId)).toMatchObject([{ error_code: 'CONTENT_INVALID' }]);
  });

  it('a damaged approved snapshot (a picture it names is gone) is refused before the mark, nothing sent', async () => {
    const { postId, revision, publicationId } = await dueRich('<figure><img src="tg://photo?id=p1"/></figure>', 1);
    await testDb()
      .prepare(
        `UPDATE post_revisions SET rich_html = '<figure><img src="tg://photo?id=p3"/></figure>'
          WHERE post_id = ?1 AND revision = ?2`
      )
      .bind(postId, revision)
      .run();
    const { transport, sender } = adapterTransport(() => Promise.resolve({ message_id: 1, chat: { id: 1 } }));

    await tick(transport);

    expect(sender.requests).toEqual([]);
    const job = await jobOf(publicationId);
    expect(job).toMatchObject({ status: 'failed', send_started_at: null });
    expect((await publicationOf(publicationId)).last_error_code).toBe('CONTENT_INVALID');
  });
});

describe('a rich post in the studio', () => {
  it('is not approved while it names a missing picture or uses <mark>', async () => {
    for (const [html, issue] of [
      ['<figure><img src="tg://photo?id=p2"/></figure>', 'MEDIA_MISSING'],
      ['<p><mark>Главное</mark></p>', 'MARK_FORBIDDEN']
    ] as const) {
      const draft = await richDraft(html, 1);
      const response = await api.request(`/api/v1/posts/${draft.id}/approve`, {
        method: 'POST',
        json: { revision: draft.revision }
      });
      expect(response.status).toBe(400);
      expect(apiErrorSchema.parse(await response.json()).error.details).toMatchObject({
        reason: 'RICH_INVALID',
        issue
      });
    }
  });

  it('keeps its pictures in place: no reorder, no removal, no detach from the library (QA 23.10.2026)', async () => {
    const draft = await richDraft('<figure><img src="tg://photo?id=p1"/></figure>', 2);
    const state = postSchema.parse(await (await api.request(`/api/v1/posts/${draft.id}`)).json());
    const [first, second] = state.media.map(({ id }) => id);
    const reorder = await api.request(`/api/v1/posts/${draft.id}/media/order`, {
      method: 'PATCH',
      json: { revision: draft.revision, mediaIds: [second, first] }
    });
    expect(reorder.status).toBe(400);
    expect(apiErrorSchema.parse(await reorder.json()).error.details).toMatchObject({ reason: 'RICH_NOT_EDITABLE' });
    const remove = await api.request(`/api/v1/posts/${draft.id}/media/${first}`, {
      method: 'DELETE',
      json: { revision: draft.revision }
    });
    expect(remove.status).toBe(400);
    const detach = await api.request(`/api/v1/media/${first}?detach=drafts`, { method: 'DELETE' });
    expect(detach.status).toBe(409);
    const after = postSchema.parse(await (await api.request(`/api/v1/posts/${draft.id}`)).json());
    expect(after.media.map(({ id }) => id)).toEqual([first, second]);
  });

  it('rebuilds its rich HTML from an edited text, and refuses a text that lost the structure (owner, 24.10.2026)', async () => {
    const draft = await richDraft('<p>Текст</p>');
    const body = 'Карнавал стал добрее\n\nЧто изменилось:\n• за Turbo — 1 Scrap';
    const edited = await api.request(`/api/v1/posts/${draft.id}`, {
      method: 'PATCH',
      json: { revision: draft.revision, body, entities: [] }
    });
    expect(edited.status).toBe(200);
    const after = postSchema.parse(await edited.json());
    expect(after.richHtml).toContain('<h3>Карнавал стал добрее</h3>');
    expect(after.richHtml).toContain('<ul><li>за Turbo — 1 Scrap</li></ul>');
    const broken = await api.request(`/api/v1/posts/${draft.id}`, {
      method: 'PATCH',
      json: { revision: after.revision, body: 'Одна строка без заголовка.', entities: [] }
    });
    expect(broken.status).toBe(400);
    expect(apiErrorSchema.parse(await broken.json()).error.details).toMatchObject({ reason: 'RICH_STRUCTURE_LOST' });
    const kept = postSchema.parse(await (await api.request(`/api/v1/posts/${draft.id}`)).json());
    expect(kept.richHtml).toBe(after.richHtml);
  });
});
