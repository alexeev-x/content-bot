import { aiItemScriptSchema, apiErrorSchema, contentItemDetailSchema, contentReportSchema } from '@alexeev/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { titleFormat } from '../../src/modules/content-analytics/title-format';
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

    // An unlinked video without a rubric in its title is outside the rubrics.
    expect(await detail('tiktok:v5')).toMatchObject({ format: 'standalone', formatSource: 'title' });
  });

  it('finds the rubric in a title despite a typo, by «Часть N», and never in an unrelated one', () => {
    for (const title of [
      'Учусь играть в доту. Часть 69',
      'Пудж через мид, хуки мимо, тиммейты в шоке, а я снова в таверне. уЧуСь ИгРаТь в доту',
      'Оракл: кому палец, кому лечение, и почему керри меня ненавидит после этой катки. Учусь иград в доту. Часть 72',
      'Учусь игарть в доту. Часть 70',
      'Учус играт в доту',
      'Часть 71: Лич',
      '#учусьиграть оракл'
    ])
      expect(titleFormat(title)).toBe('igrat');
    for (const title of ['Учу фидить в доту', 'Учу фидить: правило дня', 'Учу фидиь на миде', '#учуфидить'])
      expect(titleFormat(title)).toBe('fidit');
    for (const title of ['Мем про патч 7.40', 'Играю в доту с подписчиками', 'Учусь готовить', 'Лучший фидер года'])
      expect(titleFormat(title)).toBe('standalone');
  });

  it('reads the rubric from the title of an unlinked video; a linked script still wins', async () => {
    const titled = async (n: number, title: string, views24: number) =>
      testDb()
        .prepare(
          `INSERT INTO content_items (id, platform, title, url, published_at, views, observed_at, v24h)
           VALUES (?, 'tiktok', ?, 'https://example.com/v', ?, ?, ?, ?)`
        )
        .bind(`tiktok:t${n}`, title, START - (n + 2) * DAY, views24, START, views24)
        .run();
    const titles = [
      'Учусь играть в доту! Лич',
      'Оракл. #учусьиграть',
      'УЧУСЬ ИГРАТЬ: стаки',
      'Учусь  играть, часть 14',
      'учусь играть — Пудж'
    ];
    for (const [n, title] of titles.entries()) await titled(n + 1, title, 1000);
    await titled(6, 'Учу фидить: правило дня', 90_000);
    await titled(7, 'Мем про патч', 90_000);
    await titled(10, 'Учусь играть в доту! Инвокер', 2000);

    // Five «Учусь играть» titles make the format curve; the «Учу фидить» and outside videos stay out of it.
    expect(await detail('tiktok:t10')).toMatchObject({
      format: 'igrat',
      formatSource: 'title',
      baseline: { format: 'igrat', points: [{ ageHours: 24, views: 1000, items: 5 }] }
    });
    expect(await detail('tiktok:t6')).toMatchObject({ format: 'fidit', formatSource: 'title' });
    expect(await detail('tiktok:t7')).toMatchObject({ format: 'standalone', formatSource: 'title' });

    // A script of another rubric overrides the title.
    await testDb()
      .prepare('INSERT INTO content_ai_links (content_item_id, revision_id, linked_at) VALUES (?, ?, ?)')
      .bind('tiktok:t1', OTHER, START)
      .run();
    expect(await detail('tiktok:t1')).toMatchObject({ format: 'fidit', formatSource: 'script' });
    expect((await detail('tiktok:t10')).baseline.format ?? null).toBeNull();
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

  it('leaves a confirmed contaminated video out of every curve, keeps a weak one, and rebuilds the report', async () => {
    for (let n = 1; n <= 5; n += 1) await seedVideo(n, 1000, true);
    await seedVideo(6, 10, false);
    await seedVideo(10, 2000, true);
    const contaminate = (id: string, reason: string | null) =>
      api.request(`/api/v1/content-analytics/items/${encodeURIComponent(id)}/contamination`, {
        method: 'PUT',
        json: { reason }
      });
    const tiktokCurve = async () =>
      contentReportSchema
        .parse(await (await api.request('/api/v1/content-analytics/report?days=7')).json())
        .baselines.find((curve) => curve.platform === 'tiktok')?.points[0]?.items;

    expect((await detail('tiktok:v10')).baseline).toMatchObject({ format: 'igrat', points: [{ items: 5 }] });
    // The weak unrestricted v6 is a result, so it stays in the platform curve: v1–v6 and v10.
    expect(await tiktokCurve()).toBe(7);

    expect((await contaminate('tiktok:v1', 'restricted')).status).toBe(204);
    expect((await contaminate('tiktok:v1', 'restricted')).status).toBe(204);
    expect(await detail('tiktok:v1')).toMatchObject({ contamination: { reason: 'restricted' } });
    // Four clean videos of the format are not enough; the platform curve also drops v1.
    const weak = await detail('tiktok:v10');
    expect(weak).toMatchObject({ formatItems: 4, contamination: null, baseline: { points: [{ items: 5 }] } });
    expect(weak.baseline.format ?? null).toBeNull();
    // The stored report is rebuilt at once, not after its hour.
    expect(await tiktokCurve()).toBe(6);

    // A Telegram post can be contaminated too; clearing restores the curve.
    expect((await contaminate(POST, 'collection_failure')).status).toBe(204);
    expect((await contaminate('tiktok:v1', null)).status).toBe(204);
    expect((await detail('tiktok:v10')).baseline).toMatchObject({ format: 'igrat', points: [{ items: 5 }] });
    expect(await tiktokCurve()).toBe(7);

    const invalid = await contaminate('tiktok:v1', 'low_views');
    expect(invalid.status).toBe(400);
    expect(apiErrorSchema.parse(await invalid.json()).error.code).toBe('VALIDATION_ERROR');
    expect((await contaminate('tiktok:missing', 'removed')).status).toBe(404);
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
