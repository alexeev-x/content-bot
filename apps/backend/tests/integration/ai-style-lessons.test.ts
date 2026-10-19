import { beforeEach, describe, expect, it } from 'vitest';
import { createContainer } from '../../src/app/container';
import { lessonAlert, runStyleLessons } from '../../src/app/workflows/style-lessons';
import {
  type AiTextProvider,
  AiProviderError,
  createD1AiRepository,
  createD1StyleLessonsRepository,
  learnFromEdits,
  updateAiSettings
} from '../../src/modules/ai';
import { testDb } from '../helpers/db';
import { fakeClock, OWNER_ID, resetDb, START } from '../helpers/harness';
import { meteredDb } from '../helpers/metered-db';

// The writer learns from the owner's future work (AI plan P7c): each noticeable edit or remark is read once into
// a lesson; one draft is only a guess, two drafts or the owner's own words make a question, and a turned-down
// lesson never comes back.

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const LESSON = 'Не заканчивай призывом подписаться';

let answers: (string | Error)[];
let inputs: string[];

const provider: AiTextProvider = {
  provider: 'openai',
  complete: (request) => {
    inputs.push(request.input);
    const next = answers.shift() ?? JSON.stringify({ lesson: '', same: '' });
    if (next instanceof Error) return Promise.reject(next);
    return Promise.resolve({
      text: next,
      model: 'gpt-6.1-sol',
      usage: { inputTokens: 800, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 60 }
    });
  }
};

const lessons = () => createD1StyleLessonsRepository(testDb());
const run = (now = START + 60_000) =>
  learnFromEdits(
    {
      repo: createD1AiRepository(testDb()),
      lessons: lessons(),
      clock: fakeClock(now),
      timezone: 'Europe/Moscow',
      newId: () => crypto.randomUUID(),
      provider
    },
    { signal: AbortSignal.timeout(5000) }
  );

let seq = 0;
/** A draft the owner approved after changing `ratio` of it; returns the generation id. */
async function edited(ratio: number, final = 'Моя версия без призыва.') {
  seq += 1;
  const generation = uuid(100 + seq);
  await testDb().batch([
    testDb()
      .prepare(
        `INSERT INTO ai_generations (id, kind, format, mode, source, task, status, pack_revision, created_at, updated_at)
         VALUES (?1, 'draft', 'igrat', 'direct', 'bot', 'задание', 'ready', 'pack', ?2, ?2)`
      )
      .bind(generation, START),
    testDb()
      .prepare(
        `INSERT INTO ai_text_revisions (id, generation_id, provenance, text, created_at)
         VALUES (?1, ?2, 'AI_DRAFT', 'Текст ИИ. И подпишись!', ?3)`
      )
      .bind(uuid(200 + seq), generation, START),
    testDb()
      .prepare(
        `INSERT INTO ai_text_revisions (id, generation_id, provenance, text, edit_ratio, created_at)
         VALUES (?1, ?2, 'OWNER_APPROVED', ?3, ?4, ?5)`
      )
      .bind(uuid(300 + seq), generation, final, ratio, START + 1000)
  ]);
  return generation;
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
  answers = [];
  inputs = [];
  seq = 0;
});

describe('style lessons', () => {
  it('reads each edit once, asks after a second draft shows the same lesson, and skips small edits', async () => {
    await edited(0.4);
    await edited(0.05);
    answers.push(JSON.stringify({ lesson: LESSON, same: '' }));
    const first = await run();
    // The 5% edit is never read: a small edit teaches a false lesson.
    expect(first).toMatchObject({ read: 1, learned: 1, toAsk: [] });
    expect(inputs[0]).toContain('ВЕРСИЯ АВТОРА');
    expect(await run()).toMatchObject({ read: 0 });

    await edited(0.3);
    answers.push(JSON.stringify({ lesson: '', same: 'k1' }));
    const second = await run();
    expect(inputs[1]).toContain(`k1 | ${LESSON}`);
    expect(second.toAsk).toMatchObject([{ text: LESSON, scope: 'igrat', drafts: 2, fromRemark: false }]);
    expect(lessonAlert(second.toAsk[0]!).html).toContain('Похоже, вы всегда так правите');
  });

  it("asks at once about the owner's own words, and never proposes a turned-down lesson again", async () => {
    const generation = await edited(0.05);
    await testDb()
      .prepare(
        `INSERT INTO ai_feedback (id, generation_id, kind, note, created_at) VALUES (?1, ?2, 'weak_hook', ?3, ?4)`
      )
      .bind(uuid(1), generation, 'не надо в конце писать подпишись', START + 2000)
      .run();
    answers.push(JSON.stringify({ lesson: LESSON, same: '' }));
    const result = await run();
    expect(inputs[0]).toContain('ЗАМЕЧАНИЕ АВТОРА');
    expect(result.toAsk).toMatchObject([{ text: LESSON, fromRemark: true }]);
    const id = result.toAsk[0]!.id;
    expect(await lessons().markAsked(id, START)).toBe(true);
    expect(await lessons().reject({ id, now: START })).toBe(true);

    await edited(0.5);
    answers.push(JSON.stringify({ lesson: `${LESSON}!`, same: '' }));
    const again = await run();
    expect(inputs[1]).toContain(`- ${LESSON}`);
    expect(again).toMatchObject({ learned: 0, toAsk: [] });
  });

  it('reads an edit again when the run that claimed it died, and not while that run may still work', async () => {
    const generation = await edited(0.4);
    const key = `revision:${uuid(300 + seq)}`;
    // A run claimed it and its Worker died before any answer.
    expect(await lessons().claim({ key, generationId: generation }, START)).toBe(true);
    expect(await lessons().unread(START - 1, 5, START + 60_000)).toEqual([]);
    expect(await lessons().claim({ key, generationId: generation }, START + 60_000)).toBe(false);
    const later = START + 31 * 60_000;
    expect((await lessons().unread(START - 1, 5, later)).map((source) => source.key)).toEqual([key]);
    answers.push(JSON.stringify({ lesson: LESSON, same: '' }));
    expect(await run(later)).toMatchObject({ read: 1, learned: 1 });
  });

  it('skips a text marked «Не учиться на этом», and the oldest one-draft guess gives way at the cap', async () => {
    await edited(0.4);
    await testDb()
      .prepare(`INSERT INTO ai_learning_exclusions (source, source_id, created_at) VALUES ('revision', ?, 1)`)
      .bind(uuid(300 + seq))
      .run();
    expect(await lessons().unread(START - 1, 5, START + 60_000)).toEqual([]);

    // 40 open guesses, then a new edit: the oldest guess makes room instead of the new lesson being lost.
    await testDb().batch(
      Array.from({ length: 40 }, (_, index) =>
        testDb()
          .prepare(
            `INSERT INTO ai_style_lessons (id, text, scope, status, created_at, updated_at)
             VALUES (?1, ?2, 'igrat', 'seen', ?3, ?3)`
          )
          .bind(uuid(500 + index), `Старый урок ${index}`, START - 1000 + index)
      )
    );
    await edited(0.4);
    answers.push(JSON.stringify({ lesson: LESSON, same: '' }));
    expect(await run()).toMatchObject({ learned: 1 });
    const kept = await testDb()
      .prepare(`SELECT count(*) AS n, sum(text = ?1) AS fresh, sum(id = ?2) AS oldest FROM ai_style_lessons`)
      .bind(LESSON, uuid(500))
      .first<{ n: number; fresh: number; oldest: number }>();
    expect(kept).toEqual({ n: 40, fresh: 1, oldest: 0 });
  });

  it('gives an edit back when the model fails and learns nothing from a fact fix', async () => {
    await edited(0.4);
    answers.push(new AiProviderError('AI_TIMEOUT'));
    expect(await run()).toMatchObject({ read: 0, errorCode: 'AI_TIMEOUT' });
    answers.push(JSON.stringify({ lesson: '', same: '' }));
    expect(await run()).toMatchObject({ read: 1, learned: 0 });
    expect(await run()).toMatchObject({ read: 0 });
    expect(await testDb().prepare('SELECT count(*) AS n FROM ai_style_lessons').first<{ n: number }>()).toEqual({
      n: 0
    });
  });
});

describe('style lesson job budget', () => {
  it('reads a full run of edits and asks within one consumer call of 50 D1 statements', async () => {
    for (let index = 0; index < 4; index += 1) await edited(0.4);
    // Every answer a new lesson, so each source takes the longest path.
    for (let index = 0; index < 3; index += 1) answers.push(JSON.stringify({ lesson: `${LESSON} ${index}`, same: '' }));
    const metered = meteredDb(testDb());
    const container = createContainer(
      { DB: metered.db, OWNER_TELEGRAM_ID: OWNER_ID },
      { clock: fakeClock(START + 60_000), aiProvider: provider, newId: () => crypto.randomUUID() }
    );
    const errors: unknown[] = [];
    await runStyleLessons(container, 'test', (error) => errors.push(error));
    expect(errors).toEqual([]);
    expect(inputs).toHaveLength(3);
    expect(metered.meter.statements).toBeLessThanOrEqual(50);
  });
});
