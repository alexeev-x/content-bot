import { aiLearningItemSchema, aiLearningListSchema, type UpdateAiSettingsInput } from '@alexeev/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AiTextProvider } from '../../src/modules/ai';
import { testDb } from '../helpers/db';
import { expectError } from '../helpers/expect-error';
import { writerAnswer } from '../helpers/writer-answer';
import { createApi, fakeClock, OWNER_TOKEN, resetDb, seedSession, START } from '../helpers/harness';

const SETTINGS: Omit<UpdateAiSettingsInput, 'revision'> = {
  provider: 'openai',
  enabled: true,
  draftModel: 'gpt-6.1-sol',
  cheapModel: 'gpt-6-luna',
  videoReviews: false,
  prices: [],
  monthlyBudgetUsd: 5,
  dailyCapUsd: 1,
  warnAtPercent: 80
};

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const EDITED = 'Правка владельца про варды и карту, проверено.';
const DISLIKED = 'Нелюбимый текст про рошана и сыр.';
const EXCLUDED = 'Исключённый текст про лес и крипов.';
const OWN_POST = 'Мой собственный пост про инвайт на стрим.';
const AI_POST = 'Пост из ИИ-черновика про айтемы.';
const EXCLUDED_POST = 'Исключённый собственный пост про баланс.';
const CHANNEL_OTHER = 'Текст рилса, не для ТГ-поста.';

let prompts: string[];
let revisionSeq: number;

async function seedRevision(input: {
  text: string;
  format?: 'telegram' | 'igrat';
  editRatio?: number;
  at: number;
  postId?: string;
}): Promise<{ generation: string; revision: string }> {
  revisionSeq += 1;
  const generation = uuid(100 + revisionSeq);
  const revision = uuid(200 + revisionSeq);
  await testDb().batch([
    testDb()
      .prepare(
        `INSERT INTO ai_generations (id, kind, format, mode, source, task, status, pack_revision, created_at, updated_at)
         VALUES (?, 'draft', ?, 'direct', 'bot', 'задание', 'ready', 'pack', ?, ?)`
      )
      .bind(generation, input.format ?? 'telegram', input.at, input.at),
    testDb()
      .prepare(
        `INSERT INTO ai_text_revisions (id, generation_id, provenance, text, edit_ratio, changed_parts, post_id, created_at)
         VALUES (?, ?, 'OWNER_APPROVED', ?, ?, '["hook","length"]', ?, ?)`
      )
      .bind(revision, generation, input.text, input.editRatio ?? 0.4, input.postId ?? null, input.at)
  ]);
  return { generation, revision };
}

async function seedPost(id: string, body: string, updatedAt: number, status = 'approved'): Promise<void> {
  await testDb()
    .prepare(
      `INSERT INTO posts (id, title, body, status, revision, created_at, updated_at) VALUES (?, 'Название', ?, ?, 1, ?, ?)`
    )
    .bind(id, body, status, updatedAt, updatedAt)
    .run();
}

function createStudioApi() {
  const provider: AiTextProvider = {
    provider: 'openai',
    complete: (request) => {
      prompts.push(request.input);
      return Promise.resolve({
        text: writerAnswer({ hooks: ['a', 'b', 'c'], text: 'Готовый текст.', topic: 'тема' }),
        model: 'gpt-6.1-sol',
        usage: { inputTokens: 100, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 10 }
      });
    }
  };
  return createApi({ clock: fakeClock(), aiProvider: provider, env: { AI_DRAFT_LIMIT: '50' } });
}

const draft = (api: ReturnType<typeof createStudioApi>, format: 'telegram' | 'igrat') =>
  api.request('/api/v1/ai/drafts', { method: 'POST', json: { format, mode: 'direct', task: 'как я играю про варды' } });

beforeEach(async () => {
  await resetDb();
  await seedSession({ token: OWNER_TOKEN, expiresAt: START + 86_400_000 });
  prompts = [];
  revisionSeq = 0;
});

describe('what the writer learns from', () => {
  it('never puts an excluded, disliked or AI-linked text into the prompt; owner posts teach Telegram only', async () => {
    const api = createStudioApi();
    await api.request('/api/v1/ai/settings', { method: 'PUT', json: { revision: 0, ...SETTINGS } });
    await seedRevision({ text: EDITED, at: START + 1 });
    const disliked = await seedRevision({ text: DISLIKED, at: START + 2 });
    const excluded = await seedRevision({ text: EXCLUDED, at: START + 3 });
    await seedRevision({ text: CHANNEL_OTHER, format: 'igrat', at: START + 4 });
    await testDb()
      .prepare("INSERT INTO ai_feedback (id, generation_id, kind, created_at) VALUES (?, ?, 'weak_hook', ?)")
      .bind(uuid(900), disliked.generation, START)
      .run();
    await seedPost(uuid(10), OWN_POST, START + 5);
    await seedPost(uuid(11), AI_POST, START + 6);
    await seedRevision({ text: AI_POST, editRatio: 0.01, at: START + 7, postId: uuid(11) });
    await seedPost(uuid(12), EXCLUDED_POST, START + 8);
    await seedPost(uuid(13), 'Черновик, не одобрен.', START + 9, 'draft');

    expect(
      (
        await api.request(`/api/v1/ai/learning/revision/${excluded.revision}`, {
          method: 'PUT',
          json: { excluded: true }
        })
      ).status
    ).toBe(200);
    expect(
      (await api.request(`/api/v1/ai/learning/post/${uuid(12)}`, { method: 'PUT', json: { excluded: true } })).status
    ).toBe(200);

    expect((await draft(api, 'telegram')).status).toBe(200);
    const telegram = prompts.at(-1) ?? '';
    for (const never of [DISLIKED, EXCLUDED, EXCLUDED_POST, AI_POST, CHANNEL_OTHER, 'Черновик, не одобрен.'])
      expect(telegram).not.toContain(never);
    expect(telegram.match(/Пример \(текст автора/g)?.length).toBeLessThanOrEqual(2);
    expect(telegram).toContain(OWN_POST);

    // Another format never sees a post the owner wrote for Telegram.
    expect((await draft(api, 'igrat')).status).toBe(200);
    const reel = prompts.at(-1) ?? '';
    expect(reel).not.toContain(OWN_POST);
    expect(reel).not.toContain(EDITED);
    expect(reel).toContain(CHANNEL_OTHER);
  });

  it('keeps an AI-linked post out of the examples even when only owner posts remain', async () => {
    const api = createStudioApi();
    await api.request('/api/v1/ai/settings', { method: 'PUT', json: { revision: 0, ...SETTINGS } });
    await seedPost(uuid(11), AI_POST, START + 6);
    await seedRevision({ text: AI_POST, editRatio: 0.01, at: START + 7, postId: uuid(11) });
    await draft(api, 'telegram');
    expect(prompts.at(-1) ?? '').not.toContain(AI_POST);
  });
});

describe('/api/v1/ai/learning', () => {
  it('lists both sources newest first, excludes and restores, repeating is safe, and refuses what is not eligible', async () => {
    const api = createStudioApi();
    const edited = await seedRevision({ text: EDITED, at: START + 1 });
    const unchanged = await seedRevision({ text: 'Принято как есть.', editRatio: 0.01, at: START + 2 });
    const disliked = await seedRevision({ text: DISLIKED, at: START + 3 });
    await testDb()
      .prepare("INSERT INTO ai_feedback (id, generation_id, kind, created_at) VALUES (?, ?, 'weak_hook', ?)")
      .bind(uuid(900), disliked.generation, START)
      .run();
    await seedPost(uuid(10), OWN_POST, START + 5);
    await seedPost(uuid(11), AI_POST, START + 6);
    await seedRevision({ text: AI_POST, editRatio: 0.3, at: START + 7, postId: uuid(11) });

    const list = aiLearningListSchema.parse(await (await api.request('/api/v1/ai/learning')).json());
    // The AI-linked post's own approved revision is a revision source (the owner changed it); the post itself is not.
    expect(list.items.map((item) => `${item.source}:${item.excerpt}`)).toEqual([
      `revision:${AI_POST}`,
      `post:${OWN_POST}`,
      `revision:${EDITED}`
    ]);
    expect(list.items[2]).toMatchObject({ changedParts: ['hook', 'length'], editRatio: 0.4, excluded: false });
    expect(list.items[1]).toMatchObject({ format: 'telegram', changedParts: [], editRatio: null });

    for (let n = 0; n < 2; n += 1) {
      const response = await api.request(`/api/v1/ai/learning/revision/${edited.revision}`, {
        method: 'PUT',
        json: { excluded: true }
      });
      expect(aiLearningItemSchema.parse(await response.json())).toMatchObject({ id: edited.revision, excluded: true });
    }
    const after = aiLearningListSchema.parse(await (await api.request('/api/v1/ai/learning')).json());
    expect(after.items.find((item) => item.id === edited.revision)?.excluded).toBe(true);
    const back = await api.request(`/api/v1/ai/learning/revision/${edited.revision}`, {
      method: 'PUT',
      json: { excluded: false }
    });
    expect(aiLearningItemSchema.parse(await back.json()).excluded).toBe(false);

    // Not eligible: unchanged approval, disliked text, the AI-linked post, unknown id.
    for (const path of [
      `revision/${unchanged.revision}`,
      `revision/${disliked.revision}`,
      `post/${uuid(11)}`,
      `post/${uuid(77)}`
    ])
      await expectError(
        await api.request(`/api/v1/ai/learning/${path}`, { method: 'PUT', json: { excluded: true } }),
        404,
        'NOT_FOUND'
      );
    await expectError(
      await api.request(`/api/v1/ai/learning/other/${uuid(1)}`, { method: 'PUT', json: { excluded: true } }),
      400,
      'VALIDATION_ERROR'
    );
    await expectError(
      await api.request(`/api/v1/ai/learning/post/${uuid(10)}`, { method: 'PUT', json: { excluded: 'yes' } }),
      400,
      'VALIDATION_ERROR'
    );
    const rows = await testDb().prepare('SELECT COUNT(*) AS n FROM ai_learning_exclusions').first<{ n: number }>();
    expect(rows?.n).toBe(0);
  });
});
