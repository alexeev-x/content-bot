import { AI_REVIEW_TEXT_MAX, aiVideoReviewResultSchema } from '@alexeev/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  type AiTextProvider,
  AiProviderError,
  createD1AiRepository,
  createD1ReviewRepository,
  type ReviewDeps,
  type ReviewVideo,
  type ReviewVideoSource,
  runVideoReviews
} from '../../src/modules/ai';
import { testDb } from '../helpers/db';
import { createApi, fakeClock, type FakeClock, OWNER_TOKEN, resetDb, seedSession, START } from '../helpers/harness';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const ID = 'tiktok:review1';
const SETTINGS = {
  provider: 'openai',
  enabled: true,
  draftModel: 'gpt-6.1-sol',
  cheapModel: 'gpt-6-luna',
  videoReviews: true,
  prices: [],
  monthlyBudgetUsd: 5,
  dailyCapUsd: 1,
  warnAtPercent: 80
};
const SCRIPT = {
  revisionId: 'r1',
  format: 'igrat' as const,
  text: 'Сегодня играл на оракле.',
  approvedAt: START - 8 * DAY
};
const GOOD = JSON.stringify({
  hypotheses: ['Возможно, хук слишком поздно.', 'Возможно, тема уже приелась.'],
  nextTest: 'Начать с результата катки.'
});

function video(patch: Partial<ReviewVideo> = {}): ReviewVideo {
  return {
    id: ID,
    platform: 'tiktok',
    publishedAt: START - 5 * DAY,
    views72: 1200,
    views: 2000,
    likes: 100,
    comments: 10,
    shares: null,
    contaminated: false,
    baseline: { format: 'igrat', items: 6, views: 3000, low: 1500, high: 5000 },
    ...patch
  };
}

interface Rig {
  deps: ReviewDeps;
  clock: FakeClock;
  calls: { input: string; model: string }[];
  setVideo(value: ReviewVideo | null): void;
  setScript(value: typeof SCRIPT | null): void;
  setAnswer(answer: () => Promise<string>): void;
}

function rig(): Rig {
  const clock = fakeClock();
  const calls: Rig['calls'] = [];
  let current: ReviewVideo | null = video();
  let script: typeof SCRIPT | null = SCRIPT;
  let answer: () => Promise<string> = () => Promise.resolve(GOOD);
  const source: ReviewVideoSource = {
    dueIds: () => Promise.resolve(current === null ? [] : [current.id]),
    read: () => Promise.resolve(current),
    find: () => Promise.resolve(null)
  };
  const provider: AiTextProvider = {
    provider: 'openai',
    complete: async (request) => {
      calls.push({ input: request.input, model: request.model });
      const text = await answer();
      return {
        text,
        model: request.model,
        usage: { inputTokens: 1000, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 100 }
      };
    }
  };
  let n = 0;
  return {
    clock,
    calls,
    deps: {
      reviews: createD1ReviewRepository(testDb()),
      source,
      links: { linkOf: () => Promise.resolve(script) },
      repo: createD1AiRepository(testDb()),
      provider,
      clock,
      timezone: () => Promise.resolve('UTC'),
      newId: () => `00000000-0000-4000-8000-${String((n += 1)).padStart(12, '0')}`,
      afford: () => true
    },
    setVideo: (value) => {
      current = value;
    },
    setScript: (value) => {
      script = value;
    },
    setAnswer: (value) => {
      answer = value;
    }
  };
}

async function saveSettings(patch: Partial<typeof SETTINGS> = {}): Promise<void> {
  await createD1AiRepository(testDb()).saveSettings({
    document: JSON.stringify({ ...SETTINGS, ...patch }),
    expectedRevision: 0,
    now: START
  });
}

interface Stored {
  status: string;
  limited_reason: string | null;
  attempts: number;
  hypotheses_json: string;
  next_test: string | null;
  usage_id: string | null;
  facts_json: string | null;
  observation_json: string | null;
}
const stored = () =>
  testDb()
    .prepare(
      `SELECT status, limited_reason, attempts, hypotheses_json, next_test, usage_id, facts_json, observation_json
       FROM ai_video_reviews WHERE item_id = ?`
    )
    .bind(ID)
    .first<Stored>();
const usageCount = async () =>
  (await testDb().prepare("SELECT COUNT(*) AS n FROM ai_usage WHERE kind = 'review'").first<{ n: number }>())?.n;

beforeEach(resetDb);

describe('video review build', () => {
  it('writes facts, the same-format observation and at most two «возможно» hypotheses once', async () => {
    await saveSettings();
    const r = rig();
    r.setAnswer(() =>
      Promise.resolve(
        JSON.stringify({
          hypotheses: [`Возможно, ${'х'.repeat(500)}`, 'Это точно хук.', 'Возможно, второй.', 'Возможно, третий.'],
          nextTest: 'Тест'
        })
      )
    );
    const run = await runVideoReviews(r.deps);

    expect(run).toMatchObject({ enqueued: 1, ready: 1, limited: 0 });
    const row = await stored();
    expect(row).toMatchObject({ status: 'ready', limited_reason: null, next_test: 'Тест' });
    const hypotheses = JSON.parse(row?.hypotheses_json ?? '[]') as string[];
    expect(hypotheses).toHaveLength(2);
    expect(hypotheses[0]).toHaveLength(AI_REVIEW_TEXT_MAX);
    expect(hypotheses[1]).toBe('Возможно, второй.');
    expect(JSON.parse(row?.facts_json ?? '{}')).toEqual({
      views: 1200,
      likesPer1000: 50,
      commentsPer1000: 5,
      sharesPer1000: null
    });
    expect(JSON.parse(row?.observation_json ?? '{}')).toMatchObject({ format: 'igrat', position: 'below' });
    expect(await usageCount()).toBe(1);
    // The script and the numbers go in as data.
    expect(r.calls[0]?.input).toContain('Сегодня играл на оракле.');

    // A ready row is final: later ticks never review or call again.
    await runVideoReviews(r.deps);
    expect(r.calls).toHaveLength(1);
  });

  it('never reviews a video twice or calls the model twice when ticks overlap', async () => {
    await saveSettings();
    const r = rig();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    r.setAnswer(async () => {
      await gate;
      return GOOD;
    });
    const first = runVideoReviews(r.deps);
    const second = runVideoReviews(r.deps);
    await new Promise((resolve) => setTimeout(resolve, 50));
    release();
    await Promise.all([first, second]);

    expect(r.calls).toHaveLength(1);
    expect(await usageCount()).toBe(1);
    expect(await stored()).toMatchObject({ status: 'ready', attempts: 1 });
  });

  it('takes a claim whose lease ran out, and leaves a live one alone', async () => {
    await saveSettings();
    const r = rig();
    await r.deps.reviews.enqueue([ID], START - HOUR);
    const claimed = (until: number) =>
      testDb()
        .prepare("UPDATE ai_video_reviews SET status = 'claimed', claim_until = ?, attempts = 1 WHERE item_id = ?")
        .bind(until, ID)
        .run();

    await claimed(START + 60_000);
    await runVideoReviews(r.deps);
    expect(r.calls).toHaveLength(0);
    expect(await stored()).toMatchObject({ status: 'claimed', attempts: 1 });

    await claimed(START - 1);
    await runVideoReviews(r.deps);
    expect(r.calls).toHaveLength(1);
    expect(await stored()).toMatchObject({ status: 'ready', attempts: 2 });
  });

  it.each([
    ['contaminated', () => video({ contaminated: true })],
    ['no_snapshot', () => video({ views72: null })],
    ['weak_baseline', () => video({ baseline: { format: null, items: 0, views: null, low: null, high: null } })]
  ] as const)('limits to %s without a model call, keeping the facts', async (reason, make) => {
    await saveSettings();
    const r = rig();
    r.setVideo(make());
    await runVideoReviews(r.deps);

    expect(r.calls).toHaveLength(0);
    expect(await stored()).toMatchObject({ status: 'limited', limited_reason: reason, hypotheses_json: '[]' });
    expect(await usageCount()).toBe(0);
  });

  it('limits to no_script, reviews_off and budget without a model call', async () => {
    await saveSettings();
    const noScript = rig();
    noScript.setScript(null);
    await runVideoReviews(noScript.deps);
    expect(await stored()).toMatchObject({ status: 'limited', limited_reason: 'no_script' });

    await resetDb();
    await saveSettings({ videoReviews: false });
    const off = rig();
    await runVideoReviews(off.deps);
    expect(await stored()).toMatchObject({ status: 'limited', limited_reason: 'reviews_off' });

    await resetDb();
    await saveSettings({ dailyCapUsd: 0.01 });
    const spent = rig();
    await createD1AiRepository(testDb()).recordUsage({
      id: '00000000-0000-4000-8000-0000000000aa',
      at: START,
      kind: 'draft',
      provider: 'openai',
      model: 'gpt-6.1-sol',
      usage: { inputTokens: 1, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 1 },
      costMicroUsd: 20_000
    });
    await runVideoReviews(spent.deps);
    expect(await stored()).toMatchObject({ status: 'limited', limited_reason: 'budget' });

    expect([...noScript.calls, ...off.calls, ...spent.calls]).toHaveLength(0);
  });

  it('reviews a video limited by the switch once the owner turns reviews on, and leaves no_script final', async () => {
    await saveSettings({ videoReviews: false });
    const off = rig();
    await runVideoReviews(off.deps);
    expect(await stored()).toMatchObject({ status: 'limited', limited_reason: 'reviews_off' });

    // Still off: nothing is reopened and nothing is called.
    await runVideoReviews(off.deps);
    expect(off.calls).toHaveLength(0);
    expect(await stored()).toMatchObject({ status: 'limited', limited_reason: 'reviews_off' });

    // The owner turns reviews on (saveSettings only writes revision 0).
    await testDb()
      .prepare('UPDATE ai_settings SET document = ?, revision = revision + 1')
      .bind(JSON.stringify({ ...SETTINGS, videoReviews: true }))
      .run();
    const on = rig();
    await runVideoReviews(on.deps);
    expect(on.calls).toHaveLength(1);
    expect(await stored()).toMatchObject({ status: 'ready', limited_reason: null, attempts: 1 });

    await resetDb();
    await saveSettings();
    const noScript = rig();
    noScript.setScript(null);
    await runVideoReviews(noScript.deps);
    await runVideoReviews(noScript.deps);
    expect(noScript.calls).toHaveLength(0);
    expect(await stored()).toMatchObject({ status: 'limited', limited_reason: 'no_script', attempts: 1 });
  });

  it('retries a provider failure on later ticks, then ends as model_failed; a wrong shape ends at once', async () => {
    await saveSettings();
    const r = rig();
    r.setAnswer(() => Promise.reject(new AiProviderError('AI_PROVIDER_UNREACHABLE')));
    await runVideoReviews(r.deps);
    expect(await stored()).toMatchObject({ status: 'pending', attempts: 1, limited_reason: null });
    await runVideoReviews(r.deps);
    await runVideoReviews(r.deps);
    expect(await stored()).toMatchObject({ status: 'limited', limited_reason: 'model_failed', attempts: 3 });
    expect(r.calls).toHaveLength(3);
    await runVideoReviews(r.deps);
    expect(r.calls).toHaveLength(3);

    await resetDb();
    await saveSettings();
    const wrong = rig();
    wrong.setAnswer(() => Promise.resolve('не JSON'));
    await runVideoReviews(wrong.deps);
    expect(await stored()).toMatchObject({ status: 'limited', limited_reason: 'model_failed', attempts: 1 });
    // The call was billed, so it is on the ledger.
    expect(await usageCount()).toBe(1);
  });
});

describe('GET /api/v1/ai/reviews/{itemId}', () => {
  async function seedVideo(id: string, platform: string, publishedAt: number) {
    await testDb()
      .prepare(
        `INSERT INTO content_items (id, platform, title, url, published_at, views, observed_at)
         VALUES (?, ?, 'ролик', 'https://example.com/v', ?, 100, ?)`
      )
      .bind(id, platform, publishedAt, publishedAt)
      .run();
  }

  it('returns the stored review with its cost, pending for a due video, and null otherwise', async () => {
    await seedSession({ token: OWNER_TOKEN, expiresAt: START + 7 * DAY });
    const api = createApi({ clock: fakeClock() });
    const get = async (id: string) =>
      aiVideoReviewResultSchema.parse(await (await api.request(`/api/v1/ai/reviews/${id}`)).json()).review;

    await seedVideo(ID, 'tiktok', START - 5 * DAY);
    await seedVideo('youtube:due', 'youtube', START - 4 * DAY);
    await seedVideo('youtube:young', 'youtube', START - DAY);
    await seedVideo('telegram:post-1', 'telegram', START - 5 * DAY);

    await saveSettings();
    const r = rig();
    await runVideoReviews(r.deps);
    const ready = await get(ID);
    expect(ready).toMatchObject({
      itemId: ID,
      status: 'ready',
      limitedReason: null,
      facts: { views: 1200, likesPer1000: 50 },
      observation: { format: 'igrat', position: 'below' },
      model: 'gpt-6-luna'
    });
    expect(ready?.hypotheses).toHaveLength(2);
    // 1 000 × $0.10 + 100 × $0.50 per million.
    expect(ready?.costUsd).toBe(0.00015);

    expect(await get('youtube:due')).toMatchObject({ status: 'pending', hypotheses: [], costUsd: null });
    expect(await get('youtube:young')).toBeNull();
    expect(await get('telegram:post-1')).toBeNull();
    expect((await api.request('/api/v1/ai/reviews/bad id')).status).toBe(400);
  });
});
