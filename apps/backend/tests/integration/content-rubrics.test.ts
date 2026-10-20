import { contentPostRubricSchema, contentRubricSchema, contentRubricsSchema } from '@alexeev/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { testDb } from '../helpers/db';
import { expectError } from '../helpers/expect-error';
import { createApi, OWNER_TOKEN, resetDb, seedSession, START } from '../helpers/harness';
import { seedApprovedPost, seedDestination, seedPublication } from '../helpers/publishing';

// Telegram rubrics against results (plan B3, migration 0089): the owner's pick for the studio post a channel message
// was sent from wins; otherwise the rubric's hashtag or its name opening the post decides.

const CHANNEL = 'alexeev_x';
const DAY = 86_400_000;

beforeEach(resetDb);

async function seedItem(messageId: number, title: string, tags: string[] | null, publishedAt = START - DAY) {
  await testDb()
    .prepare(
      `INSERT INTO content_items (id, platform, title, url, thumbnail_url, published_at, views, likes, comments, shares,
                                  observed_at, tags)
       VALUES (?1, 'telegram', ?2, 'https://t.me/x/1', NULL, ?3, 100, 5, NULL, NULL, ?3, ?4)`
    )
    .bind(`telegram:${messageId}`, title, publishedAt, tags === null ? null : JSON.stringify(tags))
    .run();
}

async function setup() {
  await seedSession({ token: OWNER_TOKEN, expiresAt: START + 30 * DAY });
  const api = createApi({ env: { ANALYTICS_TELEGRAM_CHANNEL: `@${CHANNEL}` } });
  const create = async (name: string, tag: string | null) =>
    contentRubricSchema.parse(
      await (await api.request('/api/v1/content-analytics/rubrics', { method: 'POST', json: { name, tag } })).json()
    );
  const read = async () =>
    contentRubricsSchema.parse(await (await api.request('/api/v1/content-analytics/rubrics?days=30')).json());
  return { api, create, read };
}

/** A studio post sent to `chatId` as message `messageId`. */
async function sentPost(api: ReturnType<typeof createApi>, chatId: string, messageId: number) {
  const post = await seedApprovedPost(api, `Пост ${messageId}`);
  const destination = await seedDestination(api, { chatId });
  const publication = await seedPublication(api, {
    postId: post.id,
    revision: post.revision,
    destinationId: destination.id,
    scheduledAt: new Date(START + DAY).toISOString()
  });
  await testDb()
    .prepare('UPDATE publications SET external_message_id = ? WHERE id = ?')
    .bind(String(messageId), publication.id)
    .run();
  return post.id;
}

describe('/api/v1/content-analytics/rubrics', () => {
  it('finds a rubric by its hashtag past the first line, or by its name opening the post', async () => {
    const { api, create, read } = await setup();
    const verdict = await create('Вердикт чата', '#Вердикт');
    const fidit = await create('Учу фидить', null);
    expect(verdict.tag).toBe('вердикт');
    await seedItem(1, 'Кто сильнее на линии?', ['dota', 'вердикт']);
    await seedItem(2, '🎯 Учу фидить: правило дня', null);
    // A word that only starts like the name is not the rubric.
    await seedItem(3, 'Учу фидитьзря', null);
    await seedItem(4, 'Просто пост', []);
    // QA, 20.10.2026: an emoji opening the name, and «ё» in a tag, match as they do in the post.
    const memes = await create('🔥 Мемы дня', '#Ёлка');
    expect(memes.tag).toBe('елка');
    await seedItem(5, 'Мемы дня: подборка', null);
    await seedItem(6, 'Без названия', ['елка']);
    const { items } = await read();
    expect([...items].sort((a, b) => a.itemId.localeCompare(b.itemId))).toEqual([
      { itemId: 'telegram:1', rubricId: verdict.id, source: 'marker' },
      { itemId: 'telegram:2', rubricId: fidit.id, source: 'marker' },
      { itemId: 'telegram:5', rubricId: memes.id, source: 'marker' },
      { itemId: 'telegram:6', rubricId: memes.id, source: 'marker' }
    ]);
    // Without a period only the names come back: the settings and the editor read no posts.
    const names = contentRubricsSchema.parse(await (await api.request('/api/v1/content-analytics/rubrics')).json());
    expect(names).toMatchObject({ items: [] });
    expect(names.rubrics).toHaveLength(3);
  });

  it('takes the owner pick for a studio post sent to the analytics channel, never one sent elsewhere', async () => {
    const { api, create, read } = await setup();
    const verdict = await create('Вердикт чата', 'вердикт');
    const fidit = await create('Учу фидить', null);
    const channelPost = await sentPost(api, `@${CHANNEL.toUpperCase()}`, 10);
    const testPost = await sentPost(api, '-1001234567890', 11);
    // The text says «вердикт», the owner picked «Учу фидить»: the pick wins.
    await seedItem(10, 'Пост 10', ['вердикт']);
    await seedItem(11, 'Пост 11', null);
    for (const postId of [channelPost, testPost]) {
      const picked = await api.request(`/api/v1/content-analytics/posts/${postId}/rubric`, {
        method: 'PUT',
        json: { rubricId: fidit.id }
      });
      expect(contentPostRubricSchema.parse(await picked.json())).toEqual({ rubricId: fidit.id });
    }
    // Message 11 of the test channel is not post 11 of the analytics channel: no pick, no marker, no rubric.
    expect((await read()).items).toEqual([{ itemId: 'telegram:10', rubricId: fidit.id, source: 'studio' }]);

    // Clearing the pick leaves the marker; repeating it is a no-op.
    for (let i = 0; i < 2; i++)
      await api.request(`/api/v1/content-analytics/posts/${channelPost}/rubric`, {
        method: 'PUT',
        json: { rubricId: null }
      });
    expect((await read()).items).toEqual([{ itemId: 'telegram:10', rubricId: verdict.id, source: 'marker' }]);
  });

  it('edits and removes a rubric, refuses taken names and tags, and caps the list', async () => {
    const { api, create, read } = await setup();
    const verdict = await create('Вердикт чата', 'вердикт');
    await expectError(
      await api.request('/api/v1/content-analytics/rubrics', {
        method: 'POST',
        json: { name: 'вердикт ЧАТА', tag: null }
      }),
      409,
      'CONFLICT'
    );
    const tagTaken = await api.request('/api/v1/content-analytics/rubrics', {
      method: 'POST',
      json: { name: 'Другая', tag: '#ВЕРДИКТ' }
    });
    expect(((await tagTaken.json()) as { error: { details?: { reason?: string } } }).error.details?.reason).toBe(
      'TAG_TAKEN'
    );
    await expectError(
      await api.request('/api/v1/content-analytics/rubrics', { method: 'POST', json: { name: 'x', tag: '#a b' } }),
      400,
      'VALIDATION_ERROR'
    );
    const renamed = await api.request(`/api/v1/content-analytics/rubrics/${verdict.id}`, {
      method: 'PUT',
      json: { name: 'Вердикт', tag: null }
    });
    expect(contentRubricSchema.parse(await renamed.json())).toEqual({ id: verdict.id, name: 'Вердикт', tag: null });

    const post = await seedApprovedPost(api, 'Пост');
    await api.request(`/api/v1/content-analytics/posts/${post.id}/rubric`, {
      method: 'PUT',
      json: { rubricId: verdict.id }
    });
    for (let i = 0; i < 2; i++)
      expect((await api.request(`/api/v1/content-analytics/rubrics/${verdict.id}`, { method: 'DELETE' })).status).toBe(
        204
      );
    // The pick went with the rubric.
    expect(
      contentPostRubricSchema.parse(
        await (await api.request(`/api/v1/content-analytics/posts/${post.id}/rubric`)).json()
      )
    ).toEqual({ rubricId: null });
    await expectError(
      await api.request(`/api/v1/content-analytics/posts/${post.id}/rubric`, {
        method: 'PUT',
        json: { rubricId: verdict.id }
      }),
      404,
      'NOT_FOUND'
    );
    await expectError(
      await api.request(`/api/v1/content-analytics/rubrics/${verdict.id}`, {
        method: 'PUT',
        json: { name: 'Н', tag: null }
      }),
      404,
      'NOT_FOUND'
    );

    for (let i = 0; i < 20; i++) await create(`Рубрика ${i}`, null);
    const over = await api.request('/api/v1/content-analytics/rubrics', {
      method: 'POST',
      json: { name: 'Лишняя', tag: null }
    });
    expect(over.status).toBe(409);
    expect((await read()).rubrics).toHaveLength(20);
    await expectError(await api.request('/api/v1/content-analytics/rubrics', { token: null }), 401, 'UNAUTHORIZED');
  });
});
