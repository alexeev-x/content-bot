import { aiDraftChainSchema, aiDraftsPageSchema } from '@alexeev/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { testDb } from '../helpers/db';
import { expectError } from '../helpers/expect-error';
import { createApi, fakeClock, OWNER_TOKEN, resetDb, seedSession, START } from '../helpers/harness';
import { meteredDb } from '../helpers/metered-db';

// The studio's history of AI drafts (AI plan P8; SYS-01): a draft from the bot with its rewrite, the owner's
// version and approval, the verdict and what the calls cost; first drafts only in the list, newest first.

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ROOT = uuid(1);
const REWRITE = uuid(2);
const OTHER = uuid(3);

async function seed() {
  const generation = (id: string, parent: string | null, at: number, usage: string | null, task = 'задание') =>
    testDb()
      .prepare(
        `INSERT INTO ai_generations (id, kind, format, mode, source, task, parent_generation_id, status, model,
                                     pack_revision, usage_id, result, created_at, updated_at)
         VALUES (?1, ?2, 'igrat', 'direct', 'bot', ?3, ?4, 'ready', 'gpt-6.1-sol', 'pack', ?5, 'draft', ?6, ?6)`
      )
      .bind(id, parent === null ? 'draft' : 'rewrite', task, parent, usage, at);
  const usage = (id: string, cost: number) =>
    testDb()
      .prepare(
        `INSERT INTO ai_usage (id, at, kind, provider, model, input_tokens, cached_input_tokens, output_tokens, cost_micro_usd)
         VALUES (?, ?, 'draft', 'openai', 'gpt-6.1-sol', 1000, 0, 100, ?)`
      )
      .bind(id, START, cost);
  const revision = (
    id: string,
    gen: string,
    provenance: string,
    text: string,
    at: number,
    ratio: number | null = null
  ) =>
    testDb()
      .prepare(
        `INSERT INTO ai_text_revisions (id, generation_id, provenance, text, edit_ratio, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .bind(id, gen, provenance, text, ratio, at);
  await testDb().batch([
    usage(uuid(90), 20_000),
    usage(uuid(91), 5_000),
    generation(ROOT, null, START, uuid(90), 'Учусь играть на Пудже: промахнулся хуком'),
    generation(REWRITE, ROOT, START + 60_000, uuid(91)),
    generation(OTHER, null, START + 120_000, null, 'Пост про патч'),
    revision(uuid(10), ROOT, 'AI_DRAFT', 'Первый вариант.', START),
    revision(uuid(11), REWRITE, 'AI_DRAFT', 'Короче.', START + 60_000),
    revision(uuid(12), REWRITE, 'OWNER_EDITED', 'Моя версия.', START + 90_000),
    revision(uuid(13), REWRITE, 'OWNER_APPROVED', 'Моя версия.', START + 100_000, 0.4),
    testDb()
      .prepare(
        `INSERT INTO ai_feedback (id, generation_id, kind, revision_id, note, created_at)
         VALUES (?, ?, 'weak_hook', ?, 'Начало вялое', ?)`
      )
      .bind(uuid(20), ROOT, uuid(10), START + 30_000)
  ]);
}

beforeEach(async () => {
  await resetDb();
  await seedSession({ token: OWNER_TOKEN, expiresAt: START + 86_400_000 });
  await seed();
});

describe('AI draft history', () => {
  it('lists first drafts with their totals and opens one with every version, text and verdict', async () => {
    const api = createApi({ clock: fakeClock() });
    const page = aiDraftsPageSchema.parse(await (await api.request('/api/v1/ai/drafts')).json());
    expect(page.items.map((row) => row.id)).toEqual([OTHER, ROOT]);
    expect(page.items[1]).toMatchObject({
      task: 'Учусь играть на Пудже: промахнулся хуком',
      versions: 2,
      approved: true,
      edited: true,
      feedbackCount: 1,
      costUsd: 0.025
    });
    expect(page.items[0]).toMatchObject({ versions: 1, approved: false, costUsd: null });

    const chain = aiDraftChainSchema.parse(await (await api.request(`/api/v1/ai/drafts/${ROOT}`)).json());
    expect(chain.truncated).toBe(false);
    expect(chain.versions.map((version) => [version.id, version.kind, version.texts.map((t) => t.provenance)])).toEqual(
      [
        [ROOT, 'draft', ['AI_DRAFT']],
        [REWRITE, 'rewrite', ['AI_DRAFT', 'OWNER_EDITED', 'OWNER_APPROVED']]
      ]
    );
    expect(chain.versions[0]?.feedback).toEqual([
      { kind: 'weak_hook', note: 'Начало вялое', createdAt: new Date(START + 30_000).toISOString() }
    ]);
    expect(chain.versions[1]).toMatchObject({ parentId: ROOT, costUsd: 0.005 });
  });

  it('refuses a version that is not a first draft, a bad query and anyone but the owner (SYS-09)', async () => {
    const api = createApi({ clock: fakeClock() });
    await expectError(await api.request(`/api/v1/ai/drafts/${REWRITE}`), 404, 'NOT_FOUND');
    await expectError(await api.request(`/api/v1/ai/drafts/${uuid(77)}`), 404, 'NOT_FOUND');
    await expectError(await api.request('/api/v1/ai/drafts?sort=bad'), 400, 'VALIDATION_ERROR');
    await expectError(await api.request('/api/v1/ai/drafts?page=0'), 400, 'VALIDATION_ERROR');
    await expectError(await api.request('/api/v1/ai/drafts', { token: null }), 401, 'UNAUTHORIZED');
    await expectError(await api.request(`/api/v1/ai/drafts/${ROOT}`, { token: null }), 401, 'UNAUTHORIZED');
  });

  it('keeps a long emoji task within the contract and says when a chain is longer than shown (review 19.10.2026)', async () => {
    const api = createApi({ clock: fakeClock() });
    await testDb().prepare('UPDATE ai_generations SET task = ? WHERE id = ?').bind('я😀'.repeat(300), OTHER).run();
    // 40 rewrites, each off the one before: more than the 31 versions a chain shows.
    let parent = OTHER;
    for (let index = 0; index < 40; index += 1) {
      const id = uuid(300 + index);
      await testDb()
        .prepare(
          `INSERT INTO ai_generations (id, kind, format, mode, source, task, parent_generation_id, status, pack_revision,
                                       created_at, updated_at)
           VALUES (?1, 'rewrite', 'telegram', 'direct', 'bot', 'задание', ?2, 'ready', 'pack', ?3, ?3)`
        )
        .bind(id, parent, START + 200_000 + index)
        .run();
      parent = id;
    }
    const page = aiDraftsPageSchema.parse(await (await api.request('/api/v1/ai/drafts')).json());
    const long = page.items.find((row) => row.id === OTHER);
    expect(long?.task.length).toBeLessThanOrEqual(300);
    expect(long?.versions).toBe(41);
    const chain = aiDraftChainSchema.parse(await (await api.request(`/api/v1/ai/drafts/${OTHER}`)).json());
    expect(chain.versions).toHaveLength(31);
    expect(chain.truncated).toBe(true);
  });

  it('shows the bot by default, pages the studio runs by number and reads a page in a few statements', async () => {
    await testDb().batch(
      Array.from({ length: 22 }, (_, index) =>
        testDb()
          .prepare(
            `INSERT INTO ai_generations (id, kind, format, mode, source, task, status, pack_revision, created_at, updated_at)
             VALUES (?1, 'draft', 'telegram', 'direct', 'studio', 'задание', 'ready', 'pack', ?2, ?2)`
          )
          .bind(uuid(200 + index), START - (index + 1) * 60_000)
      )
    );
    const metered = meteredDb(testDb());
    const api = createApi({ clock: fakeClock(), db: metered.db });
    // Owner, 20.10.2026: 133 of 147 drafts on DEV were studio control runs; the table opens on the bot's.
    const bot = aiDraftsPageSchema.parse(await (await api.request('/api/v1/ai/drafts')).json());
    expect(bot.items.every((row) => row.source === 'bot')).toBe(true);
    expect(bot.totalCount).toBe(2);
    const first = aiDraftsPageSchema.parse(await (await api.request('/api/v1/ai/drafts?source=studio')).json());
    expect(first).toMatchObject({ page: 1, totalCount: 22, capped: false });
    expect(first.items).toHaveLength(20);
    const second = aiDraftsPageSchema.parse(await (await api.request('/api/v1/ai/drafts?source=studio&page=2')).json());
    expect(second.items).toHaveLength(2);
    expect(new Set([...first.items, ...second.items].map((row) => row.id)).size).toBe(22);
    // Session check, the roots and their totals per request.
    expect(metered.meter.statements).toBeLessThanOrEqual(18);
  });

  it('searches the task in any case, filters by outcome and format, and sorts by cost', async () => {
    const api = createApi({ clock: fakeClock() });
    const list = async (query: string) =>
      aiDraftsPageSchema
        .parse(await (await api.request(`/api/v1/ai/drafts?${query}`)).json())
        .items.map((row) => row.id);
    expect(await list(`q=${encodeURIComponent('ПУДЖЕ')}`)).toEqual([ROOT]);
    expect(await list('outcome=approved')).toEqual([ROOT]);
    expect(await list('outcome=edited')).toEqual([ROOT]);
    expect(await list('outcome=open')).toEqual([OTHER]);
    expect(await list('outcome=feedback')).toEqual([ROOT]);
    expect(await list('format=telegram')).toEqual([]);
    // A draft without a priced call sorts below every priced one.
    expect(await list('sort=cost&dir=desc')).toEqual([ROOT, OTHER]);
    expect(await list('sort=cost&dir=asc')).toEqual([OTHER, ROOT]);
  });
});
