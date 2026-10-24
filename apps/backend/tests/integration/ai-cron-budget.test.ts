import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleAiQueue } from '../../src/app/ai-queue';
import { createContainer } from '../../src/app/container';
import { createD1SystemState } from '../../src/app/system-state';
import { LOST_AFTER_MS } from '../../src/app/workflows/lost-ai-jobs';
import {
  type AiTextProvider,
  createD1AiRepository,
  createD1RulesRepository,
  createD1WriterRepository,
  updateAiSettings
} from '../../src/modules/ai';
import {
  collectContentAnalytics,
  type ConfiguredSources,
  createD1ContentAlertRepository,
  createD1ContentAnalyticsRepository,
  createD1ContentDailyReportRepository,
  createD1ContentForecastRepository,
  createD1ContentGoalRepository,
  raiseDailyReport,
  setContentGoal
} from '../../src/modules/content-analytics';
import { createD1SettingsRepository, saveOwnerOperationsSettings } from '../../src/modules/settings';
import { createLogger } from '../../src/platform/logging/logger';
import { testDb } from '../helpers/db';
import { fakeTransport, makeTick, type Tick, tickCount } from '../helpers/dispatch';
import { fakeOwnerMessenger } from '../helpers/fake-owner-messenger';
import { fakeClock, OWNER_ID, resetDb } from '../helpers/harness';
import { meteredDb, type Meter } from '../helpers/metered-db';
import { writerAnswer } from '../helpers/writer-answer';

// P9 section A (budgets): one Cron tick or one queue consumer call has 50 D1 statements on the Free plan. Every
// step that owns a minute runs here on "everything on" data through the metered binding, back to back with the
// others, and must both do its work and stay inside 50 statements and 50 round trips.
//
// Measured, statements / round trips (the limit is 50 of each):
//   Cron   minute 2 daily 32/30 with one overdue release (the month of videos, the older ones, the channel and followers: 22.10.2026), minute 2 Monday weekly 28/25 (the top videos of 20.10.2026: one batch of two), minute 4 and 24 lost jobs 16/16, minute 8 alerts 23/20,
//          minute 9 script prompts 26/23, minutes 14, 34, 54 reviews 38/32, minute 44 style lessons 11/10
//   Queue  draft 19/16, rewrite 20/17, facts 21/18, fix 25/21, chat 12/9, daily_review of the week with the rules
//          summary 48/38 (the tightest: eight script reads, three new rules, four alerts, two budget notices).
// style_lessons has its own budget test in ai-style-lessons.test.ts («style lesson job budget»).

const LIMIT = 50;
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const ZONE = 'Europe/Moscow';
const ORIGIN = 'https://studio.example.com';
const TOKEN = '123456:TEST-BOT-TOKEN-PLACEHOLDER';
const logger = createLogger(() => undefined);

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const AI_SETTINGS = {
  revision: 0,
  provider: 'openai' as const,
  enabled: true,
  draftModel: 'gpt-6.1-sol',
  cheapModel: 'gpt-6-luna',
  videoReviews: true,
  prices: [],
  monthlyBudgetUsd: 5,
  dailyCapUsd: 1,
  warnAtPercent: 80
};

// Tuesday 20.10.2026 10:mm Moscow, and Monday 19.10.2026 10:02 Moscow for the weekly report.
const tuesday = (minute: number) => Date.UTC(2026, 9, 20, 7, minute);
const MONDAY_2 = Date.UTC(2026, 9, 19, 7, 2);

const idleSources = (): ConfiguredSources => ({
  collectors: [
    {
      platform: 'youtube',
      handle: 'a',
      profileUrl: 'https://youtube.com/@a',
      requests: 1,
      collect: async () => ({ followers: 10, items: [] })
    }
  ],
  handles: { youtube: { handle: 'a', profileUrl: 'https://youtube.com/@a' } },
  tiktok: null
});

async function enableAi(patch: Partial<typeof AI_SETTINGS> = {}) {
  await updateAiSettings({ repo: createD1AiRepository(testDb()), clock: fakeClock() }, { ...AI_SETTINGS, ...patch });
}

async function enableOwnerSettings(now: number) {
  await saveOwnerOperationsSettings(
    { repo: createD1SettingsRepository(testDb()), logger, requestId: 't', now },
    {
      actor: 'owner',
      input: {
        revision: 0,
        timezone: ZONE,
        notifications: {
          warningsEnabled: true,
          publicationAlerts: true,
          sourceAlerts: true,
          automationAlerts: true,
          recoveryAlerts: true,
          dotaWatchlistAlerts: true,
          scheduleNotices: true,
          sentNotices: true,
          dailyReport: true,
          dailyReportHour: 0
        }
      }
    }
  );
  await createD1SystemState(testDb()).rememberAppOrigin(ORIGIN, now);
}

interface Run {
  tick: Tick;
  meter: Meter;
  jobs: unknown[];
}

/** One minute tick through the metered binding; the queue binding is a recorder. */
async function runTick(at: number, extra: { provider?: AiTextProvider } = {}): Promise<Run> {
  const metered = meteredDb(testDb());
  const jobs: unknown[] = [];
  const tick = makeTick({
    db: metered.db,
    clock: fakeClock(at),
    scheduledTime: at,
    transport: fakeTransport(),
    tweak: (container) =>
      ({
        ...container,
        contentSources: idleSources(),
        aiJobs: { send: async (job: unknown) => void jobs.push(job) },
        ...(extra.provider === undefined ? {} : { aiProvider: extra.provider })
      }) as typeof container
  });
  await tick.run();
  expect(tick.container.queryBudget.remaining()).toBeGreaterThanOrEqual(0);
  return { tick, meter: metered.meter, jobs };
}

function expectBudget(meter: Meter) {
  expect(meter.statements).toBeLessThanOrEqual(LIMIT);
  expect(meter.roundTrips).toBeLessThanOrEqual(LIMIT);
}

let approvedSeq = 0;
/** An approved revision of a draft of `format`; the generation is made on the way. */
async function seedApproved(revisionId: string, format: string, text: string, at: number) {
  approvedSeq += 1;
  const generation = uuid(9000 + approvedSeq);
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

async function seedItem(id: string, platform: string, title: string, publishedAt: number, extra = '') {
  await testDb()
    .prepare(
      `INSERT INTO content_items (id, platform, title, url, published_at, views, observed_at${extra === '' ? '' : ', v24h, v72h'})
       VALUES (?, ?, ?, 'https://example.com/v', ?, 5000, ?${extra === '' ? '' : ', 1000, 3000'})`
    )
    .bind(id, platform, title, publishedAt, publishedAt)
    .run();
}

beforeEach(async () => {
  await resetDb();
  approvedSeq = 0;
});

describe('Cron ticks with everything on', () => {
  const VIDEOS = 10;

  /**
   * Twenty videos on two platforms collected hour by hour for 26 hours before `at`, and a daily report of the
   * evening before still waiting for its review (so the tick has an overdue report to release).
   */
  async function seedReportWorld(at: number) {
    const clock = fakeClock(at - 26 * HOUR);
    const deps = {
      analytics: createD1ContentAnalyticsRepository(testDb()),
      alerts: createD1ContentAlertRepository(testDb()),
      forecasts: createD1ContentForecastRepository(testDb()),
      reports: createD1ContentDailyReportRepository(testDb())
    };
    const platform = (name: 'youtube' | 'tiktok', views: number) => ({
      platform: name,
      handle: 'a',
      profileUrl: `https://${name}.com/@a`,
      requests: 1,
      collect: async () => ({
        followers: 10,
        items: Array.from({ length: VIDEOS }, (_unused, index) => ({
          externalId: String(index),
          title: `Ролик <${index}> | Учу фидить в доту`,
          url: `https://${name}.com/watch/${index}?feature=share`,
          thumbnailUrl: null,
          publishedAt: at - 26 * HOUR - (index + 1) * 3 * HOUR,
          views: views + index,
          likes: null,
          comments: null,
          shares: null
        }))
      })
    });
    for (let hour = 0; hour < 26; hour += 1) {
      if (hour === 15) {
        await raiseDailyReport({ ...deps, clock, timezone: ZONE, hour: 0 });
      }
      const views = 1000 + 100 * hour;
      await collectContentAnalytics({
        repo: deps.analytics,
        sources: {
          collectors: [platform('youtube', views), platform('tiktok', 2 * views)],
          handles: {},
          tiktok: null
        },
        clock,
        logger,
        requestId: 't'
      });
      clock.advance(HOUR);
    }
    await enableOwnerSettings(at);
    await enableAi({ videoReviews: false });
  }

  it('minute 2, daily report on: stores the day, releases the overdue one, queues the review', async () => {
    const at = tuesday(2);
    await seedReportWorld(at);
    const { tick, meter, jobs } = await runTick(at);
    expect(tickCount(tick, 'dailyReportRaised')).toBe(1);
    expect(tickCount(tick, 'dailyReportReleased')).toBe(1);
    expect(tickCount(tick, 'dailyReviewQueued')).toBe(1);
    expect(jobs).toMatchObject([{ kind: 'daily_review' }]);
    expectBudget(meter);
  });

  it('minute 2 on Monday from 10:00: stores the week, releases the overdue day, queues the review', async () => {
    await seedReportWorld(MONDAY_2);
    for (const [index, title] of ['Открыл обучение', 'Патч 7.40', 'Опрос про героев'].entries())
      await seedItem(`telegram:${index}`, 'telegram', title, Date.parse(`2026-10-1${4 + index}T12:00:00Z`));
    await testDb()
      .prepare('INSERT INTO content_audience_days (platform, day, followers, observed_at) VALUES (?, ?, ?, ?)')
      .bind('telegram', '2026-10-11', 820, MONDAY_2)
      .run();
    await testDb()
      .prepare('INSERT INTO content_audience_days (platform, day, followers, observed_at) VALUES (?, ?, ?, ?)')
      .bind('telegram', '2026-10-18', 831, MONDAY_2)
      .run();
    for (const platform of ['telegram', 'youtube', 'tiktok'] as const)
      await setContentGoal(
        { repo: createD1ContentGoalRepository(testDb()), clock: fakeClock(MONDAY_2) },
        { platform, target: 10_000 }
      );
    const { tick, meter, jobs } = await runTick(MONDAY_2);
    expect(tickCount(tick, 'weeklyReportRaised')).toBe(1);
    expect(tickCount(tick, 'dailyReportReleased')).toBe(1);
    expect(tickCount(tick, 'dailyReviewQueued')).toBe(1);
    expect(jobs).toMatchObject([{ kind: 'daily_review', reportId: expect.stringMatching(/^weekly:/) as string }]);
    expectBudget(meter);
  });

  // With the content alerts that send them, in the same tick (review 24.10.2026).
  it.each([8, 28])('minute %i: tells of lost queue jobs, three per tick', async (minute) => {
    const at = tuesday(minute);
    await enableOwnerSettings(at);
    await testDb()
      .prepare('UPDATE content_sources SET last_success_at = ?1, last_error_at = ?2, last_error_code = ?3')
      .bind(at - 3 * DAY, at - HOUR, 'SOURCE_FAILED')
      .run();
    const writer = createD1WriterRepository(testDb());
    for (let index = 0; index < 4; index += 1)
      expect(
        await writer.claimJob(uuid(100 + index), at - LOST_AFTER_MS - 60 * MINUTE, { chatId: 42, messageId: index + 1 })
      ).toBe(true);
    const { tick, meter } = await runTick(at);
    expect(tickCount(tick, 'lostAiJobsReported')).toBe(3);
    expectBudget(meter);
  });

  it('minute 8: raises three source alerts and sends two of them', async () => {
    const at = tuesday(8);
    await enableOwnerSettings(at);
    await testDb()
      .prepare('UPDATE content_sources SET last_success_at = ?1, last_error_at = ?2, last_error_code = ?3')
      .bind(at - 3 * DAY, at - HOUR, 'SOURCE_FAILED')
      .run();
    const { tick, meter } = await runTick(at);
    expect(tickCount(tick, 'contentAlertsRaised')).toBe(3);
    expect(tickCount(tick, 'contentAlertsSent')).toBe(2);
    expect(tick.ownerMessages).toHaveLength(2);
    expectBudget(meter);
  });

  it('minute 9: links one new video on both platforms and asks about another', async () => {
    const at = tuesday(9);
    await enableOwnerSettings(at);
    const ORACLE = uuid(1);
    const LION = uuid(2);
    const ORACLE_2 = uuid(3);
    await seedApproved(
      ORACLE,
      'igrat',
      'Как я на Оракле играл: лечил врагов, кидал фортуну мимо, Оракл бедный.',
      at - 2 * DAY
    );
    await seedApproved(LION, 'igrat', 'Лион: ульта в крипа.', at - 3 * DAY);
    await seedApproved(ORACLE_2, 'igrat', 'Оракл: фортуна мимо.', at - 4 * DAY);
    const title = 'Как я на оракле играл. Лечил врагов, фортуна мимо. Учусь играть в доту';
    await seedItem('youtube:o', 'youtube', title, at - DAY);
    await seedItem('tiktok:o', 'tiktok', title, at - DAY);
    await seedItem('youtube:x', 'youtube', 'Новый герой. Учусь играть в доту. Часть 70', at - DAY);
    const { tick, meter } = await runTick(at);
    expect(tickCount(tick, 'scriptPromptsRaised')).toBe(2);
    const links = await testDb().prepare('SELECT count(*) AS n FROM content_ai_links').first<{ n: number }>();
    expect(links?.n).toBe(2);
    expectBudget(meter);
  });

  it.each([14, 34, 54])('minute %i: reviews the 72 hour old videos that are due', async (minute) => {
    const at = tuesday(minute);
    await enableOwnerSettings(at);
    await enableAi();
    const SCRIPT = uuid(4);
    await seedApproved(SCRIPT, 'igrat', 'Сегодня играл на оракле и понял, что лечить надо раньше.', at - 20 * DAY);
    // Six videos of the rubric measured at 72 h make the baseline; two more are 80 hours old and due.
    for (let index = 0; index < 6; index += 1)
      await seedItem(`tiktok:base${index}`, 'tiktok', 'Учусь играть в доту', at - (31 + index) * DAY, 'checkpoints');
    for (const id of ['tiktok:due1', 'youtube:due2']) {
      await seedItem(id, id.split(':')[0]!, 'Учусь играть в доту. Часть 70', at - 80 * HOUR, 'checkpoints');
      await testDb()
        .prepare('INSERT INTO content_ai_links (content_item_id, revision_id, linked_at) VALUES (?, ?, ?)')
        .bind(id, SCRIPT, at - 70 * HOUR)
        .run();
    }
    const provider: AiTextProvider = {
      provider: 'openai',
      complete: async (request) => ({
        text: JSON.stringify({
          hypotheses: ['Возможно, хук поздно.', 'Возможно, тема приелась.'],
          nextTest: 'Начать с итога.'
        }),
        model: request.model,
        usage: { inputTokens: 1000, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 100 }
      })
    };
    const { tick, meter } = await runTick(at, { provider });
    expect(tickCount(tick, 'aiReviewsQueued')).toBe(2);
    expect(tickCount(tick, 'aiReviewsReady')).toBeGreaterThanOrEqual(1);
    expectBudget(meter);
  });

  it('minute 44: queues one job for unread owner edits', async () => {
    const at = tuesday(44);
    await enableOwnerSettings(at);
    for (let index = 0; index < 4; index += 1) {
      const generation = uuid(200 + index);
      await testDb().batch([
        testDb()
          .prepare(
            `INSERT INTO ai_generations (id, kind, format, mode, source, task, status, pack_revision, created_at, updated_at)
             VALUES (?1, 'draft', 'igrat', 'direct', 'bot', 'задание', 'ready', 'pack', ?2, ?2)`
          )
          .bind(generation, at - HOUR),
        testDb()
          .prepare(
            `INSERT INTO ai_text_revisions (id, generation_id, provenance, text, created_at)
             VALUES (?1, ?2, 'AI_DRAFT', 'Текст ИИ. И подпишись!', ?3)`
          )
          .bind(uuid(300 + index), generation, at - HOUR),
        testDb()
          .prepare(
            `INSERT INTO ai_text_revisions (id, generation_id, provenance, text, edit_ratio, created_at)
             VALUES (?1, ?2, 'OWNER_APPROVED', 'Моя версия без призыва.', 0.4, ?3)`
          )
          .bind(uuid(400 + index), generation, at - HOUR + 1000)
      ]);
    }
    const { tick, meter, jobs } = await runTick(at);
    expect(tickCount(tick, 'styleLessonsQueued')).toBe(1);
    expect(jobs).toMatchObject([{ kind: 'style_lessons' }]);
    expectBudget(meter);
  });
});

describe('queue consumer, one call per job kind', () => {
  const NOW = tuesday(30);
  const CHAT_ID = Number(OWNER_ID);
  const MESSAGE_ID = 20;
  const REVIEW = {
    main: 'Неделя ровная.',
    points: [{ text: 'V1 держится', confidence: 'low' }],
    question: '',
    steps: ['Начать с косяка.']
  };
  const draft = writerAnswer({
    hooks: ['Пять хуков — один крип.', 'Я думал, что попал.', 'Пудж и промахи.'],
    text: 'Пять хуков — один крип. Вчера я промахнулся четыре раза, а на пятом зацепил крипа.',
    topic: 'Пудж и промахи хуком',
    device: 'личная неудача',
    ending: 'крип вместо героя'
  });
  const question = writerAnswer({ kind: 'ideas', question: 'Что случилось с хуками?', ideas: ['Пудж и хуки'] });

  let answers: string[];
  let calls: string[];
  let provider: AiTextProvider;
  let messenger: ReturnType<typeof fakeOwnerMessenger>;

  beforeEach(async () => {
    answers = [];
    calls = [];
    messenger = fakeOwnerMessenger();
    provider = {
      provider: 'openai',
      complete: async (request) => ({
        text: answers.shift() ?? '',
        model: request.model,
        usage: { inputTokens: 3000, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 400 }
      })
    };
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const method =
        String(input instanceof Request ? input.url : input)
          .split('/')
          .pop() ?? '';
      calls.push(method);
      const body = JSON.parse(String(init?.body ?? '{}')) as { text?: string };
      const result =
        method === 'sendMessage'
          ? { message_id: 99, date: 1, chat: { id: CHAT_ID, type: 'private', first_name: 'X' }, text: body.text }
          : true;
      return Promise.resolve(Response.json({ ok: true, result }));
    });
    await enableOwnerSettings(NOW);
    await enableAi({ videoReviews: false });
  });

  afterEach(() => vi.restoreAllMocks());

  /** One consumer call (a batch of one message) on `db`. */
  async function consume(body: unknown, db: D1Database): Promise<void> {
    const container = createContainer(
      { DB: db, OWNER_TELEGRAM_ID: OWNER_ID, TELEGRAM_BOT_TOKEN: TOKEN },
      { clock: fakeClock(NOW), aiProvider: provider, ownerMessenger: messenger }
    );
    const message = { id: crypto.randomUUID(), timestamp: new Date(), body, attempts: 1, ack() {}, retry() {} };
    await handleAiQueue(
      { queue: 'q', messages: [message], ackAll() {}, retryAll() {} } as unknown as MessageBatch<unknown>,
      container,
      TOKEN
    );
  }

  const base = () => ({ id: crypto.randomUUID(), chatId: CHAT_ID, messageId: MESSAGE_ID, appOrigin: ORIGIN });

  async function measured(body: unknown): Promise<Meter> {
    const metered = meteredDb(testDb());
    await consume(body, metered.db);
    expectBudget(metered.meter);
    return metered.meter;
  }

  /** A draft the writer made in an earlier call: its id and the token of its newest version. */
  async function firstDraft() {
    answers.push(draft);
    await consume({ ...base(), kind: 'draft', format: 'igrat', task: 'Про Пуджа и хуки' }, testDb());
    const generation = await testDb()
      .prepare('SELECT id FROM ai_generations ORDER BY created_at DESC, id DESC LIMIT 1')
      .first<{ id: string }>();
    const revision = await testDb()
      .prepare('SELECT id FROM ai_text_revisions WHERE generation_id = ? ORDER BY created_at DESC, id DESC LIMIT 1')
      .bind(generation?.id)
      .first<{ id: string }>();
    return { generationId: generation!.id, revisionToken: revision!.id.slice(-12) };
  }

  it('draft', async () => {
    answers.push(draft);
    await measured({ ...base(), kind: 'draft', format: 'igrat', task: 'Про Пуджа и хуки' });
    expect(calls).toContain('editMessageText');
  });

  it('rewrite', async () => {
    const first = await firstDraft();
    answers.push(draft);
    calls.length = 0;
    await measured({ ...base(), kind: 'rewrite', action: 'short', ...first });
    expect(calls).toContain('editMessageText');
  });

  it('facts', async () => {
    answers.push(question);
    await consume({ ...base(), kind: 'draft', format: 'igrat', task: 'Про Пуджа' }, testDb());
    const asked = await testDb().prepare('SELECT id FROM ai_generations').first<{ id: string }>();
    answers.push(draft);
    calls.length = 0;
    await measured({
      ...base(),
      kind: 'facts',
      generationId: asked!.id,
      task: 'Про Пуджа. Вчера промахнулся хуком четыре раза.'
    });
    expect(calls).toContain('editMessageText');
  });

  it('fix, with a remark that names no reason button', async () => {
    const first = await firstDraft();
    answers.push(JSON.stringify({ ...JSON.parse(draft), changes: 'Изменил хук', reasons: ['weak_hook'] }));
    calls.length = 0;
    await measured({
      ...base(),
      kind: 'fix',
      ...first,
      note: 'хук слабый, начни с промаха',
      feedbackId: null,
      reason: null
    });
    expect(calls).toContain('editMessageText');
    const recorded = await testDb().prepare('SELECT count(*) AS n FROM ai_feedback').first<{ n: number }>();
    expect(recorded?.n).toBe(1);
  });

  it('chat, with a full history', async () => {
    answers.push('Давай начнём с промаха.');
    const history = Array.from({ length: 16 }, (_unused, index) => ({
      role: index % 2 === 0 ? ('owner' as const) : ('editor' as const),
      text: `Реплика ${index}`
    }));
    await measured({ ...base(), kind: 'chat', text: 'Что с хуком?', history });
    expect(calls).toContain('editMessageText');
  });

  it('daily_review of the week with the rules summary', async () => {
    // Twelve measured videos, each filmed from its own owner-linked script: the weekly report shows eight of them.
    const analytics = createD1ContentAnalyticsRepository(testDb());
    const clock = fakeClock(MONDAY_2 - 26 * HOUR);
    const formats = ['igrat', 'fidit', 'standalone'];
    const items = Array.from({ length: 12 }, (_unused, index) => ({
      externalId: String(index),
      title: `Ролик ${index} | Учу фидить в доту`,
      url: `https://youtube.com/watch/${index}`,
      thumbnailUrl: null,
      publishedAt: MONDAY_2 - 26 * HOUR - (index + 1) * 3 * HOUR,
      views: 3000 + index,
      likes: null,
      comments: null,
      shares: null
    }));
    await collectContentAnalytics({
      repo: analytics,
      sources: {
        collectors: [
          {
            platform: 'youtube',
            handle: 'a',
            profileUrl: 'https://youtube.com/@a',
            requests: 1,
            collect: async () => ({ followers: 10, items })
          }
        ],
        handles: {},
        tiktok: null
      },
      clock,
      logger,
      requestId: 't'
    });
    for (const [index, item] of items.entries()) {
      const revision = uuid(500 + index);
      await seedApproved(
        revision,
        formats[index % 3]!,
        `Сценарий ${index}: начни с промаха и его цены.`,
        MONDAY_2 - 20 * DAY
      );
      await testDb().batch([
        testDb()
          .prepare(
            "INSERT INTO content_ai_links (content_item_id, revision_id, linked_at, origin) VALUES (?, ?, ?, 'owner')"
          )
          .bind(`youtube:${item.externalId}`, revision, MONDAY_2 - 20 * DAY),
        testDb()
          .prepare(
            `INSERT INTO ai_video_reviews (item_id, status, attempts, facts_json, observation_json, hypotheses_json, created_at, updated_at)
             VALUES (?, 'ready', 1, '{}', ?, '[]', ?, ?)`
          )
          .bind(
            `youtube:${item.externalId}`,
            JSON.stringify({ position: index < 9 ? 'above' : 'below' }),
            NOW + 1,
            NOW + 1
          )
      ]);
    }
    // Both model calls cross the warning line, so the owner is told twice more.
    await updateAiSettings(
      { repo: createD1AiRepository(testDb()), clock: fakeClock() },
      { ...AI_SETTINGS, revision: 1, videoReviews: false, warnAtPercent: 10, monthlyBudgetUsd: 0.2, dailyCapUsd: 0.2 }
    );
    const rules = createD1RulesRepository(testDb());
    await rules.createAnalysisRule({
      id: uuid(600),
      text: 'Начинай с промаха и его цены',
      scope: 'igrat',
      now: MONDAY_2 - 10 * DAY
    });
    await rules.approve({ id: uuid(600), now: MONDAY_2 - 9 * DAY });

    const reports = createD1ContentDailyReportRepository(testDb());
    const { raiseWeeklyReport } = await import('../../src/modules/content-analytics');
    const raised = await raiseWeeklyReport({
      analytics,
      alerts: createD1ContentAlertRepository(testDb()),
      goals: createD1ContentGoalRepository(testDb()),
      reports,
      clock: fakeClock(MONDAY_2),
      timezone: ZONE
    });
    expect(raised.reportId).toMatch(/^weekly:/);

    const consolidation = JSON.stringify({
      follows: [{ rule: 'r1', videos: ['v1', 'v2', 'v4', 'v5'] }],
      proposals: [
        {
          text: 'Называй цену ошибки в первой фразе',
          videos: Array.from({ length: 12 }, (_unused, index) => `v${index + 1}`)
        }
      ]
    });
    const metered = meteredDb(testDb());
    provider = {
      provider: 'openai',
      complete: async (request) => {
        calls.push(request.jsonSchema?.name ?? 'review');
        return {
          text: request.jsonSchema?.name === 'rule_consolidation' ? consolidation : JSON.stringify(REVIEW),
          model: request.model,
          usage: { inputTokens: 3000, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 400 }
        };
      }
    };
    await consume({ id: crypto.randomUUID(), kind: 'daily_review', reportId: raised.reportId }, metered.db);
    const released = await testDb()
      .prepare('SELECT status, review_error AS err FROM content_daily_reports WHERE id = ?')
      .bind(raised.reportId)
      .first<{ status: string }>();
    expect(released).toEqual({ status: 'reviewed', err: null });
    expect(calls).toContain('rule_consolidation');
    const proposals = await testDb()
      .prepare("SELECT count(*) AS n FROM content_alerts WHERE id LIKE 'rule:%'")
      .first<{ n: number }>();
    expect(proposals?.n).toBeGreaterThan(0);
    expectBudget(metered.meter);
  });
});
