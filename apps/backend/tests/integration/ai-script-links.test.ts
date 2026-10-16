import { aiItemScriptSchema, apiErrorSchema } from '@alexeev/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { testDb } from '../helpers/db';
import { type Api, createApi, fakeClock, OWNER_TOKEN, resetDb, seedSession, START } from '../helpers/harness';

const DAY = 86_400_000;
const VIDEO = 'tiktok:7696861824037227809';
const POST = 'telegram:alexeev_dota-123';
const SCRIPT = '00000000-0000-4000-8000-0000000000c1';
const OTHER = '00000000-0000-4000-8000-0000000000c2';
const TELEGRAM_TEXT = '00000000-0000-4000-8000-0000000000c3';

let api: Api;

async function seedItem(id: string, platform: string, title: string, publishedAt: number) {
  await testDb()
    .prepare(
      `INSERT INTO content_items (id, platform, title, url, published_at, views, observed_at)
       VALUES (?, ?, ?, 'https://example.com/v', ?, 100, ?)`
    )
    .bind(id, platform, title, publishedAt, publishedAt)
    .run();
}

/** An approved revision of a draft of `format`, approved at `at`. */
async function seedApproved(revisionId: string, format: string, text: string, at: number) {
  const generation = revisionId.replace(/c(\d)$/, 'd$1');
  await testDb().batch([
    testDb()
      .prepare(
        `INSERT INTO ai_generations (id, kind, format, mode, source, task, status, pack_revision, created_at, updated_at)
         VALUES (?, 'draft', ?, 'direct', 'bot', 'задание', 'ready', 'pack', ?, ?)`
      )
      .bind(generation, format, at, at),
    testDb()
      .prepare(
        `INSERT INTO ai_text_revisions (id, generation_id, provenance, text, edit_ratio, created_at)
         VALUES (?, ?, 'OWNER_APPROVED', ?, 0.3, ?)`
      )
      .bind(revisionId, generation, text, at)
  ]);
}

const read = async (path: string, init?: Parameters<Api['request']>[1]) => {
  const response = await api.request(path, init);
  return { status: response.status, body: (await response.json()) as unknown };
};

beforeEach(async () => {
  await resetDb();
  await seedSession({ token: OWNER_TOKEN, expiresAt: START + 7 * DAY });
  api = createApi({ clock: fakeClock() });
  await seedItem(VIDEO, 'tiktok', 'Как я на оракле играл. Учусь играть в доту', START - DAY);
  await seedItem(POST, 'telegram', 'Пост про патч', START - DAY);
  await seedApproved(SCRIPT, 'igrat', 'Сегодня играл на оракле и понял, что лечить надо раньше.', START - 3 * DAY);
  await seedApproved(OTHER, 'fidit', 'Учу фидить: варды решают.', START - 5 * DAY);
  await seedApproved(TELEGRAM_TEXT, 'telegram', 'Оракл в патче стал сильнее.', START - 2 * DAY);
});

describe('/api/v1/ai/scripts/{itemId}', () => {
  it('proposes Reels scripts by title, links the confirmed one, replaces and removes it', async () => {
    const first = await read(`/api/v1/ai/scripts/${VIDEO}`);
    expect(first.status).toBe(200);
    const proposed = aiItemScriptSchema.parse(first.body);
    // The shared «оракл» puts the matching script first; a Telegram text is never a Reels candidate.
    expect(proposed.linked).toBeNull();
    expect(proposed.candidates.map((script) => script.revisionId)).toEqual([SCRIPT, OTHER]);

    const linked = await read(`/api/v1/ai/scripts/${VIDEO}`, { method: 'PUT', json: { revisionId: SCRIPT } });
    expect(linked.status).toBe(200);
    expect(aiItemScriptSchema.parse(linked.body)).toMatchObject({ linked: { revisionId: SCRIPT, format: 'igrat' } });
    expect(aiItemScriptSchema.parse((await read(`/api/v1/ai/scripts/${VIDEO}`)).body).linked?.revisionId).toBe(SCRIPT);

    // Choosing another script replaces the link: one script per video.
    await read(`/api/v1/ai/scripts/${VIDEO}`, { method: 'PUT', json: { revisionId: OTHER } });
    const rows = await testDb().prepare('SELECT revision_id AS id FROM content_ai_links').all<{ id: string }>();
    expect(rows.results).toEqual([{ id: OTHER }]);

    const removed = await read(`/api/v1/ai/scripts/${VIDEO}`, { method: 'DELETE' });
    expect(aiItemScriptSchema.parse(removed.body)).toMatchObject({ linked: null });
    expect((await read(`/api/v1/ai/scripts/${VIDEO}`, { method: 'DELETE' })).status).toBe(200);
  });

  it('refuses what is not a video, an unknown video and a text that is not an approved Reels script', async () => {
    expect(aiItemScriptSchema.parse((await read(`/api/v1/ai/scripts/${POST}`)).body)).toEqual({
      linked: null,
      candidates: []
    });
    const notVideo = await read(`/api/v1/ai/scripts/${POST}`, { method: 'PUT', json: { revisionId: SCRIPT } });
    expect(notVideo.status).toBe(400);
    expect(apiErrorSchema.parse(notVideo.body).error).toMatchObject({ code: 'VALIDATION_ERROR' });

    const telegramText = await read(`/api/v1/ai/scripts/${VIDEO}`, {
      method: 'PUT',
      json: { revisionId: TELEGRAM_TEXT }
    });
    expect(telegramText.status).toBe(404);
    expect(apiErrorSchema.parse(telegramText.body).error.code).toBe('NOT_FOUND');

    const missing = await read('/api/v1/ai/scripts/youtube:missing1');
    expect(missing.status).toBe(404);
    expect(apiErrorSchema.parse(missing.body).error.code).toBe('NOT_FOUND');

    const badId = await read('/api/v1/ai/scripts/not-an-id');
    expect(badId.status).toBe(400);
    expect(apiErrorSchema.parse(badId.body).error.code).toBe('VALIDATION_ERROR');
  });
});
