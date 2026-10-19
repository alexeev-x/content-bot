import { beforeEach, describe, expect, it } from 'vitest';
import { createContainer } from '../../src/app/container';
import { runRuleConsolidation } from '../../src/app/workflows/rule-consolidation';
import { type AiTextProvider, createD1AiRepository, updateAiSettings } from '../../src/modules/ai';
import { testDb } from '../helpers/db';
import { fakeClock, OWNER_ID, resetDb, START } from '../helpers/harness';
import { meteredDb } from '../helpers/metered-db';

// The weekly run around the consolidation (AI plan P7): one result per approved script, YouTube and TikTok being
// one video, a script whose platforms disagree and a video the owner marked distorted left out, each question asked
// once, and the whole run inside one consumer's 50 D1 queries (review 19.10.2026).

const DAY = 86_400_000;
const LIMIT = 50;

let inputs: string[];
let answer: string;
const provider: AiTextProvider = {
  provider: 'openai',
  complete: (request) => {
    inputs.push(request.input);
    return Promise.resolve({
      text: answer,
      model: 'gpt-6.1-sol',
      usage: { inputTokens: 2000, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 200 }
    });
  }
};

let generation = 0;
async function seedScript(revisionId: string, text: string) {
  generation += 1;
  const generationId = `00000000-0000-4000-8000-${String(generation).padStart(12, '0')}`;
  await testDb().batch([
    testDb()
      .prepare(
        `INSERT INTO ai_generations (id, kind, format, mode, source, task, status, pack_revision, created_at, updated_at)
         VALUES (?, 'draft', 'igrat', 'direct', 'bot', 'задание', 'ready', 'pack', ?, ?)`
      )
      .bind(generationId, START - 10 * DAY, START - 10 * DAY),
    testDb()
      .prepare(
        `INSERT INTO ai_text_revisions (id, generation_id, provenance, text, edit_ratio, created_at)
         VALUES (?, ?, 'OWNER_APPROVED', ?, 0.3, ?)`
      )
      .bind(revisionId, generationId, text, START - 10 * DAY)
  ]);
}

async function seedVideo(itemId: string, revisionId: string, position: 'above' | 'below') {
  const platform = itemId.split(':')[0] ?? 'youtube';
  await testDb().batch([
    testDb()
      .prepare(
        `INSERT INTO content_items (id, platform, title, url, published_at, views, observed_at)
         VALUES (?, ?, 'Учусь играть', 'https://example.com/v', ?, 100, ?)`
      )
      .bind(itemId, platform, START - 5 * DAY, START - 5 * DAY),
    testDb()
      .prepare('INSERT INTO content_ai_links (content_item_id, revision_id, linked_at) VALUES (?, ?, ?)')
      .bind(itemId, revisionId, START - 5 * DAY),
    testDb()
      .prepare(
        `INSERT INTO ai_video_reviews (item_id, status, facts_json, observation_json, created_at, updated_at)
         VALUES (?, 'ready', '{}', ?, ?, ?)`
      )
      .bind(itemId, JSON.stringify({ position }), START - 2 * DAY, START - 2 * DAY)
  ]);
}

const SCRIPT = (letter: string) => `00000000-0000-4000-8000-0000000000${letter}${letter}`;

async function weeklyRun(reportId: string) {
  const metered = meteredDb(testDb());
  const clock = fakeClock();
  const container = createContainer(
    { DB: metered.db, OWNER_TELEGRAM_ID: OWNER_ID },
    { clock, aiProvider: provider, newId: () => crypto.randomUUID() }
  );
  const errors: unknown[] = [];
  await runRuleConsolidation(reportId, container, 'test', (error) => errors.push(error));
  expect(errors).toEqual([]);
  expect(metered.meter.statements).toBeLessThanOrEqual(LIMIT);
  return metered.meter.statements;
}

beforeEach(async () => {
  await resetDb();
  await updateAiSettings(
    { repo: createD1AiRepository(testDb()), clock: fakeClock() },
    {
      revision: 0,
      provider: 'openai',
      enabled: true,
      draftModel: 'gpt-6.1-sol',
      cheapModel: 'gpt-6-luna',
      videoReviews: false,
      prices: [],
      monthlyBudgetUsd: 5,
      dailyCapUsd: 1,
      warnAtPercent: 80
    }
  );
  inputs = [];
  answer = '{"follows":[],"proposals":[]}';
  for (const letter of ['a', 'b', 'c', 'd', 'e']) await seedScript(SCRIPT(letter), `Сценарий ${letter.toUpperCase()}`);
  await seedVideo('youtube:a', SCRIPT('a'), 'above');
  await seedVideo('tiktok:a', SCRIPT('a'), 'above');
  await seedVideo('youtube:b', SCRIPT('b'), 'above');
  await seedVideo('tiktok:b', SCRIPT('b'), 'below');
  await seedVideo('youtube:c', SCRIPT('c'), 'above');
  await seedVideo('youtube:d', SCRIPT('d'), 'below');
  await seedVideo('youtube:e', SCRIPT('e'), 'above');
  await testDb()
    .prepare(`INSERT INTO content_item_contamination (item_id, reason, set_at) VALUES ('youtube:e', 'restricted', ?)`)
    .bind(START - DAY)
    .run();
});

describe('weekly rule run', () => {
  it('weighs one result per script within the query budget, and asks about a supported rule once', async () => {
    await weeklyRun('weekly:1');
    expect(inputs).toHaveLength(1);
    const scripts = inputs[0]!.match(/Сценарий [A-E]/g);
    expect(scripts?.sort()).toEqual(['Сценарий A', 'Сценарий C', 'Сценарий D']);

    const rule = '00000000-0000-4000-8000-0000000000f1';
    await testDb().batch([
      testDb()
        .prepare(
          `INSERT INTO ai_rules (id, text, scope, source, status, created_at, updated_at)
           VALUES (?, 'Начинай с промаха', 'igrat', 'analysis', 'supported', ?, ?)`
        )
        .bind(rule, START - 20 * DAY, START - 20 * DAY),
      testDb()
        .prepare(
          `INSERT INTO ai_rule_evidence (rule_id, evidence_key, polarity, source_ref, created_at)
           VALUES (?1, 'script:x', 'support', 'origin', ?2), (?1, 'script:y', 'support', 'weekly:0', ?2)`
        )
        .bind(rule, START - 20 * DAY)
    ]);
    await weeklyRun('weekly:2');
    await weeklyRun('weekly:3');
    const alerts = await testDb()
      .prepare(`SELECT id, html FROM content_alerts WHERE id LIKE 'rule%'`)
      .all<{ id: string; html: string }>();
    expect(alerts.results).toHaveLength(1);
    expect(alerts.results[0]).toMatchObject({ id: `rule:${rule}:supported` });
    expect(alerts.results[0]?.html).toContain('Похоже, работает в «Учусь играть»');
  });
});
