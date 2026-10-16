import { aiItemScriptSchema, apiErrorSchema, contentItemDetailSchema } from '@alexeev/contracts';
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

describe('same-format baseline', () => {
  /** A TikTok video with a 24 h checkpoint, optionally linked to an «Учусь играть» script. */
  async function seedVideo(n: number, views24: number, linked: boolean) {
    const id = `tiktok:v${n}`;
    await testDb()
      .prepare(
        `INSERT INTO content_items (id, platform, title, url, published_at, views, observed_at, v24h)
         VALUES (?, 'tiktok', 'ролик', 'https://example.com/v', ?, ?, ?, ?)`
      )
      .bind(id, START - (n + 2) * DAY, views24, START, views24)
      .run();
    if (linked) {
      await testDb()
        .prepare('INSERT INTO content_ai_links (content_item_id, revision_id, linked_at) VALUES (?, ?, ?)')
        .bind(id, SCRIPT, START)
        .run();
    }
  }
  const detail = async (id: string) =>
    contentItemDetailSchema.parse(await (await api.request(`/api/v1/content-analytics/items/${id}`)).json());

  it('compares a linked video with its own format from five videos, else with the platform as a weak curve', async () => {
    for (let n = 1; n <= 4; n += 1) await seedVideo(n, 1000, true);
    for (let n = 5; n <= 9; n += 1) await seedVideo(n, 50_000, false);
    await seedVideo(10, 2000, true);

    // Four other «Учусь играть» videos: not enough, so the platform curve, with the format known.
    const weak = await detail('tiktok:v10');
    expect(weak).toMatchObject({ format: 'igrat', formatItems: 4, baseline: { platform: 'tiktok' } });
    expect(weak.baseline.format ?? null).toBeNull();

    await seedVideo(11, 1000, true);
    const strong = await detail('tiktok:v10');
    expect(strong.baseline).toMatchObject({ format: 'igrat', points: [{ ageHours: 24, views: 1000, items: 5 }] });

    // An unlinked video keeps the platform curve.
    expect((await detail('tiktok:v5')).format).toBeNull();
  });

  it('counts videos the owner marked, lets a linked script win, and never marks a Telegram post', async () => {
    for (let n = 1; n <= 3; n += 1) await seedVideo(n, 1000, true);
    for (let n = 4; n <= 7; n += 1) await seedVideo(n, 50_000, false);
    await seedVideo(10, 2000, true);
    const mark = (id: string, format: string | null) =>
      api.request(`/api/v1/content-analytics/items/${encodeURIComponent(id)}/format`, {
        method: 'PUT',
        json: { format }
      });

    // Two legacy «Учусь играть» videos marked by hand join the three linked ones: five, a format curve.
    expect((await mark('tiktok:v4', 'igrat')).status).toBe(204);
    expect((await mark('tiktok:v5', 'igrat')).status).toBe(204);
    expect((await mark('tiktok:v5', 'igrat')).status).toBe(204);
    expect((await detail('tiktok:v4')).formatSource).toBe('owner');
    expect((await detail('tiktok:v10')).baseline).toMatchObject({ format: 'igrat', points: [{ items: 5 }] });

    // A video linked to a script of another format is not counted by its stale mark; clearing removes a mark.
    await testDb()
      .prepare('INSERT INTO content_ai_links (content_item_id, revision_id, linked_at) VALUES (?, ?, ?)')
      .bind('tiktok:v5', OTHER, START)
      .run();
    expect(await detail('tiktok:v5')).toMatchObject({ format: 'fidit', formatSource: 'script' });
    expect((await mark('tiktok:v4', null)).status).toBe(204);
    expect((await detail('tiktok:v10')).baseline.format ?? null).toBeNull();

    const post = await mark(POST, 'igrat');
    expect(post.status).toBe(400);
    expect(apiErrorSchema.parse(await post.json()).error.code).toBe('VALIDATION_ERROR');
    expect((await mark('tiktok:missing', 'igrat')).status).toBe(404);
    expect((await mark('tiktok:v4', 'news')).status).toBe(400);
  });
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
