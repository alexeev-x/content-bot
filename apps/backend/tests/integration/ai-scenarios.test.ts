import type { InlineKeyboardMarkup } from 'grammy/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createD1SystemState } from '../../src/app/system-state';
import { type AiTextProvider, createD1AiRepository, updateAiSettings } from '../../src/modules/ai';
import type { ConfiguredSources } from '../../src/modules/content-analytics';
import { createD1SettingsRepository, saveOwnerOperationsSettings } from '../../src/modules/settings';
import { createLogger } from '../../src/platform/logging/logger';
import { testDb } from '../helpers/db';
import { fakeTransport, makeTick, type Tick, tickCount } from '../helpers/dispatch';
import { fakeBotAdminApi } from '../helpers/fake-bot-admin-api';
import { fakeOwnerMessenger } from '../helpers/fake-owner-messenger';
import { createApi, fakeClock, OWNER_ID, resetDb } from '../helpers/harness';
import { writerAnswer } from '../helpers/writer-answer';

// P9 section C: the AI plan's three chains end to end on the local D1 with a fake model. Every step eats the
// previous step's real output: Cron ticks (makeTick) collect, report, queue and send; the AI_JOBS consumer
// (the same handleAiQueue the Queue calls) runs the jobs; the owner answers through the bot's webhook with the
// buttons the bot itself sent. Nothing between steps is inserted into D1 by hand, and the only fake is the model
// (it reads the real prompt it is given) and the platform's video list.

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const ZONE = 'Europe/Moscow';
const ORIGIN = 'https://studio.example.com';
const SECRET = 'hook-secret-PLACEHOLDER';
const BOT_INFO = JSON.stringify({ id: 123456, is_bot: true, first_name: 'Bot', username: 'content_bot' });
const CHAT_ID = Number(OWNER_ID);
const DAYS = 28;

// Tuesday 29.09.2026: day 6, 13, 20 and 27 are Mondays, the weekly report's day.
const DAY0 = Date.UTC(2026, 8, 29);
const at = (day: number, hour: number, minute: number) => DAY0 + day * DAY + hour * HOUR + minute * MINUTE;

const TECHNIQUE = 'Называй цену промаха в первой фразе';
const LESSON = 'Не заканчивай призывом подписаться';

// One video a day at 06:00 UTC. The hero, the item and the place are the words a title and its script share, each
// list long enough that two scripts of any fortnight share at most one of them: the match stays clear.
const HEROES = [
  'Оракл',
  'Пудж',
  'Инвокер',
  'Рубик',
  'Сларк',
  'Тинкер',
  'Медуза',
  'Магнус',
  'Тайдхантер',
  'Джаггернаут',
  'Некрофос',
  'Бристлбек',
  'Висаж',
  'Шейкер',
  'Энигма',
  'Дазл',
  'Омникнайт',
  'Легион',
  'Тролль',
  'Слейер',
  'Фантом',
  'Клинкз',
  'Венга',
  'Мираж',
  'Дровка',
  'Снайпер',
  'Лайфстилер',
  'Лион'
];
const THINGS = [
  'блинком',
  'рапирой',
  'мидасом',
  'линкеном',
  'радиансом',
  'хексом',
  'эулем',
  'сатаником',
  'аганимом',
  'силверэджем',
  'фортуной'
];
const PLACES = [
  'мидлейне',
  'изилейне',
  'хардлейне',
  'лесу',
  'рошане',
  'фонтане',
  'руне',
  'кемпе',
  'аванпосте',
  'храме',
  'башне',
  'вышке',
  'склоне'
];
const BODY =
  'Расскажу по порядку, как это было. Сначала я собрал предметы и вышел на линию, потом посчитал время до новой волны крипов. ' +
  'Враг пришёл раньше, чем я ждал, и пришлось отступать под защиту союзников. Они подтянулись не сразу, поэтому первые минуты ушли на оборону. ' +
  'Дальше я забрал бонус, обменялся ударами и вернулся к фарму. К десятой минуте стало понятно, где была ошибка, и я записал её на видео, чтобы вы не повторяли. ' +
  'Смотрите внимательно и делайте выводы сами.';
const CTA =
  ' Если зашло, подпишись на канал, жми колокольчик, ставь лайк и пиши в комментариях, какого героя разобрать следующим, а я постараюсь снять это уже на этой неделе без лишних слов.';

type Kind = 'base' | 'hit' | 'miss' | 'mid';

const hero = (day: number) => HEROES[day] ?? '';
const thing = (day: number) => THINGS[day % THINGS.length] ?? '';
const place = (day: number) => PLACES[day % PLACES.length] ?? '';

/** The script of video `day`: a hit opens with the price of a miss (the technique the weekly rules look for). */
const scriptOf = (day: number, kind: Kind) =>
  `${hero(day)}: ${
    kind === 'hit'
      ? `промахнулся ${thing(day)} — и это стоило мне победы на линии ${place(day)}.`
      : `сегодня играю ${thing(day)} на линии ${place(day)} и смотрим, что выйдет.`
  } ${BODY}`;
const titleOf = (day: number) => `${hero(day)}: ${thing(day)} и ${place(day)}. Учусь играть в доту. Часть ${day + 1}`;
const task = (day: number) => `Учусь играть на ${hero(day)}: ${thing(day)} и ${place(day)}`;

/** Views at 72 hours decide the video's place among the rubric's videos: far above, far below, or the usual. */
const views72 = (day: number, kind: Kind) =>
  kind === 'hit' ? 100_000 : kind === 'miss' ? 500 : 9000 + ((day * 7) % 11) * 200;

/** From day 5 on, one hit and one miss in four, the rest usual; the first five only make the baseline. */
const rotation = (day: number): Kind =>
  day < 5 ? 'base' : ((['hit', 'miss', 'mid', 'mid'] as const)[(day - 5) % 4] ?? 'mid');

// What the fake model answers for each request, read off the real prompt it is given.
function consolidation(input: string): string {
  const scripts = [...input.matchAll(/^v(\d+) \| [^|]+ \| «(.*)»$/gm)].map((match) => ({
    ref: `v${match[1]}`,
    text: match[2] ?? ''
  }));
  const withTechnique = scripts.filter((script) => script.text.includes('стоило мне')).map((script) => script.ref);
  const follows = [...input.matchAll(/^r(\d+) \| [^|]+ \| (.*)$/gm)]
    .filter((match) => match[2] === TECHNIQUE)
    .map((match) => ({ rule: `r${match[1]}`, videos: withTechnique }));
  // A rule already known or turned down is not proposed again, as the prompt asks.
  const proposals =
    withTechnique.length >= 2 && !input.includes(TECHNIQUE) ? [{ text: TECHNIQUE, videos: withTechnique }] : [];
  return JSON.stringify({ follows, proposals });
}

/** Stubborn on purpose: a model that ignores «ОТКЛОНЕНЫ АВТОРОМ» must still be stopped by the code. */
function styleLesson(input: string): string {
  const draft = /ТЕКСТ ИИ:\n«([^»]*)»/.exec(input)?.[1] ?? '';
  const final = /ВЕРСИЯ АВТОРА:\n«([^»]*)»/.exec(input)?.[1] ?? '';
  if (!draft.includes('подпишись') || final.includes('подпишись')) return JSON.stringify({ lesson: '', same: '' });
  const known = [...input.matchAll(/^k(\d+) \| (.*)$/gm)].find((match) => match[2] === LESSON);
  return JSON.stringify(known === undefined ? { lesson: LESSON, same: '' } : { lesson: '', same: `k${known[1]}` });
}

interface ModelCall {
  schema: string;
  input: string;
}

function fakeModel() {
  const calls: ModelCall[] = [];
  const drafts: string[] = [];
  const answer = (schema: string, input: string): string => {
    switch (schema) {
      case 'writer_answer':
      case 'writer_draft': {
        const next = drafts.shift();
        if (next === undefined) throw new Error('A draft was asked for and none was queued');
        return next;
      }
      case 'analytics_review':
        return JSON.stringify({ main: 'День ровный.', points: [], question: '', steps: ['Начать с цены промаха.'] });
      case 'video_review':
        return JSON.stringify({ hypotheses: ['Возможно, хук поздно.'], nextTest: 'Начать с итога.' });
      case 'rule_consolidation':
        return consolidation(input);
      case 'style_lesson':
        return styleLesson(input);
      default:
        throw new Error(`Unexpected model request ${schema}`);
    }
  };
  const provider: AiTextProvider = {
    provider: 'openai',
    complete: (request) => {
      const schema = request.jsonSchema?.name ?? 'text';
      calls.push({ schema, input: request.input });
      return Promise.resolve({
        text: answer(schema, request.input),
        model: request.model,
        usage: { inputTokens: 1000, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 100 }
      });
    }
  };
  return {
    provider,
    calls,
    drafts,
    /** The model's requests of one kind, oldest first. */
    of: (schema: string) => calls.filter((call) => call.schema === schema)
  };
}

interface TelegramCall {
  method: string;
  body: { text?: string; reply_markup?: InlineKeyboardMarkup };
}

const callbackData = (markup: InlineKeyboardMarkup | undefined) =>
  (markup?.inline_keyboard ?? []).flat().flatMap((button) => ('callback_data' in button ? [button.callback_data] : []));

const one = async <T>(sql: string, ...binds: unknown[]) =>
  testDb()
    .prepare(sql)
    .bind(...binds)
    .first<T>();
const all = async <T>(sql: string, ...binds: unknown[]) =>
  (
    await testDb()
      .prepare(sql)
      .bind(...binds)
      .all<T>()
  ).results;
const count = async (sql: string, ...binds: unknown[]) => (await one<{ n: number }>(sql, ...binds))?.n ?? 0;

/** `videos` of the platform's list, one a day from day 0. */
function createWorld(kindOf: (day: number) => Kind, videos = DAYS) {
  const clock = fakeClock(DAY0);
  const messenger = fakeOwnerMessenger();
  const model = fakeModel();
  const telegram: TelegramCall[] = [];
  const api = createApi({
    clock,
    botInfo: BOT_INFO,
    webhookSecret: SECRET,
    botAdminApi: fakeBotAdminApi(),
    aiProvider: model.provider,
    ownerMessenger: messenger
  });
  let messageId = 50;
  let updateId = 7000;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const method =
      String(input instanceof Request ? input.url : input)
        .split('/')
        .pop() ?? '';
    const body = JSON.parse(String(init?.body ?? '{}')) as TelegramCall['body'];
    telegram.push({ method, body });
    const result =
      method === 'sendMessage'
        ? { message_id: ++messageId, date: 1, chat: { id: CHAT_ID, type: 'private', first_name: 'X' }, text: body.text }
        : true;
    return Promise.resolve(Response.json({ ok: true, result }));
  });

  // The platform: every video of the month, shown once its publication time has come, its views growing with age
  // so that the reading at 72 hours is the video's planned figure.
  const catalogue = Array.from({ length: videos }, (_unused, day) => ({
    day,
    publishedAt: at(day, 6, 0),
    target: views72(day, kindOf(day))
  }));
  const sources = (): ConfiguredSources => ({
    collectors: [
      {
        platform: 'youtube',
        handle: 'a',
        profileUrl: 'https://youtube.com/@a',
        requests: 1,
        collect: async () => ({
          followers: 1000 + Math.floor((clock.now() - DAY0) / DAY),
          items: catalogue
            .filter((video) => video.publishedAt <= clock.now())
            .map((video) => ({
              externalId: String(video.day),
              title: titleOf(video.day),
              url: `https://youtube.com/watch/${video.day}`,
              thumbnailUrl: null,
              publishedAt: video.publishedAt,
              views: Math.round((video.target * ((clock.now() - video.publishedAt) / HOUR + 6)) / 78),
              likes: null,
              comments: null,
              shares: null
            }))
        })
      }
    ],
    handles: { youtube: { handle: 'a', profileUrl: 'https://youtube.com/@a' } },
    tiktok: null
  });

  const world = {
    clock,
    messenger,
    model,
    telegram,
    api,

    async setUp(options: { dailyReport: boolean; videoReviews: boolean }) {
      await updateAiSettings(
        { repo: createD1AiRepository(testDb()), clock: fakeClock() },
        {
          revision: 0,
          provider: 'openai',
          enabled: true,
          draftModel: 'gpt-6.1-sol',
          cheapModel: 'gpt-6-luna',
          videoReviews: options.videoReviews,
          prices: [],
          monthlyBudgetUsd: 5,
          dailyCapUsd: 1,
          warnAtPercent: 80
        }
      );
      await saveOwnerOperationsSettings(
        {
          repo: createD1SettingsRepository(testDb()),
          logger: createLogger(() => undefined),
          requestId: 't',
          now: DAY0
        },
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
              dailyReport: options.dailyReport,
              dailyReportHour: 10,
              draftOffers: true,
              weeklyReport: true,
              contentAlerts: true,
              aiReviews: true,
              scriptPrompts: true,
              aiLearning: true
            }
          }
        }
      );
      await createD1SystemState(testDb()).rememberAppOrigin(ORIGIN, DAY0);
    },

    /** One Cron tick; the jobs it queued run through the consumer at once, as the Queue would deliver them. */
    async tick(time: number): Promise<Tick> {
      if (time < clock.now()) throw new Error(`Time goes back: ${new Date(time).toISOString()}`);
      clock.set(time);
      const jobs: unknown[] = [];
      const run = makeTick({
        clock,
        transport: fakeTransport(),
        scheduledTime: time,
        ownerMessenger: messenger,
        tweak: (container) =>
          ({
            ...container,
            contentSources: sources(),
            aiJobs: { send: async (job: unknown) => void jobs.push(job) },
            aiProvider: model.provider
          }) as typeof container
      });
      await run.run();
      for (const job of jobs) await api.aiJobs.deliver(job);
      return run;
    },

    /** Minute-8 ticks (two alerts each) until the owner has everything that was raised. */
    async flush(time: number): Promise<void> {
      for (let round = 0; round < 8; round += 1) {
        await world.tick(time + round * 10 * MINUTE);
        if ((await count("SELECT count(*) AS n FROM content_alerts WHERE status = 'pending'")) === 0) return;
      }
      throw new Error('The owner alerts did not drain');
    },

    /** The callback data of the buttons of the owner messages whose text contains `needle`, in the order sent. */
    buttonsOf(needle: string): string[] {
      return messenger.sent
        .filter((message) => message.html.includes(needle))
        .flatMap((message) => callbackData(message.markup));
    },

    deliver: (update: unknown) =>
      api.request(`${ORIGIN}/webhooks/telegram`, {
        method: 'POST',
        token: null,
        headers: { 'x-telegram-bot-api-secret-token': SECRET },
        json: update
      }),
    async say(text: string) {
      updateId += 1;
      const response = await world.deliver({
        update_id: updateId,
        message: {
          message_id: updateId,
          date: 1,
          chat: { id: CHAT_ID, type: 'private', first_name: 'X' },
          from: { id: CHAT_ID, is_bot: false, first_name: 'X' },
          text
        }
      });
      expect(response.status).toBe(200);
      await api.settle();
    },
    async tap(data: string): Promise<string | undefined> {
      updateId += 1;
      const before = telegram.length;
      const response = await world.deliver({
        update_id: updateId,
        callback_query: {
          id: `cb-${updateId}`,
          chat_instance: 'x',
          from: { id: CHAT_ID, is_bot: false, first_name: 'X' },
          data,
          message: {
            message_id: 51,
            date: 1,
            chat: { id: CHAT_ID, type: 'private', first_name: 'X' },
            text: 'x'
          }
        }
      });
      expect(response.status).toBe(200);
      await api.settle();
      return telegram
        .slice(before)
        .filter((call) => call.method === 'answerCallbackQuery')
        .at(-1)?.body.text;
    },

    /** The owner asks the bot for a script and gets the model's text; returns the draft's generation id. */
    async ask(request: string, draft: string): Promise<string> {
      model.drafts.push(
        writerAnswer({ hooks: ['Хук.'], text: draft, topic: request, device: 'личная неудача', ending: 'итог' })
      );
      await world.say(request);
      const approve = telegram
        .filter((call) => call.method === 'editMessageText')
        .at(-1)
        ?.body.reply_markup?.inline_keyboard.flat()
        .flatMap((button) => ('callback_data' in button ? [button.callback_data] : []))
        .find((data) => /^ai:[0-9a-f-]{36}:ok$/.test(data));
      if (approve === undefined) throw new Error('The draft came without its «Одобрить» button');
      return approve.split(':')[1] ?? '';
    },
    /** «Одобрить» on a draft as it stands: the script is approved as written. */
    async approve(generationId: string) {
      expect(await world.tap(`ai:${generationId}:ok`)).toBeUndefined();
      expect(
        await count(
          "SELECT count(*) AS n FROM ai_text_revisions WHERE generation_id = ? AND provenance = 'OWNER_APPROVED'",
          generationId
        )
      ).toBe(1);
    },
    /** The bot's edit flow: «✏️ Изменить», the owner's own text, «Одобрить». */
    async editAndApprove(generationId: string, text: string) {
      await world.tap(`ai:${generationId}:edit`);
      await world.say(text);
      await world.approve(generationId);
    },

    /** The owner approves the script of video `day` the evening before it is filmed. */
    async writeScript(day: number) {
      const generation = await world.ask(task(day), scriptOf(day, kindOf(day)));
      await world.approve(generation);
    },
    /** 06:03 collection, 06:09 script matching, the owner's message about it at 06:18. */
    async link(day: number) {
      await world.tick(at(day, 6, 9));
      await world.flush(at(day, 6, 18));
    },
    /** The buttons of the «Привязал сценарий» message of video `day`. */
    linkButtons(day: number): { confirm: string | undefined; undo: string | undefined } {
      const data = world.buttonsOf(`Ролик: «${titleOf(day)}»`);
      return { confirm: data.find((item) => item.endsWith(':c:0')), undo: data.find((item) => item.endsWith(':u:0')) };
    },
    /** The latest writer prompt the model was given. */
    lastDraftPrompt: () => model.of('writer_answer').at(-1)?.input ?? ''
  };
  return world;
}

type World = ReturnType<typeof createWorld>;

const rules = () =>
  all<{ id: string; text: string; scope: string; status: string; approved: number }>(
    "SELECT id, text, scope, status, approved_at IS NOT NULL AS approved FROM ai_rules WHERE source = 'analysis'"
  );

/** Strong edits through the bot's edit flow; each draft ends with the call to subscribe that the owner removes. */
async function edit(world: World, from: number, to: number) {
  for (let index = from; index < to; index += 1) {
    const generation = await world.ask(task(index), `${scriptOf(index, 'mid')}${CTA}`);
    await world.editAndApprove(generation, scriptOf(index, 'mid'));
    world.clock.advance(MINUTE);
  }
}

/** Five edits, the 10:44 tick, the job, the question in the owner's chat; returns the lesson's id. */
async function askedLesson(world: World) {
  world.clock.set(at(0, 10, 0));
  await edit(world, 0, 5);
  const ratios = await all<{ ratio: number }>(
    "SELECT edit_ratio AS ratio FROM ai_text_revisions WHERE provenance = 'OWNER_APPROVED'"
  );
  expect(ratios).toHaveLength(5);
  for (const { ratio } of ratios) expect(ratio).toBeGreaterThanOrEqual(0.15);

  // One job reads three edits (LESSONS_PER_RUN): a lesson from the first, the same one off the next two.
  const hourly = await world.tick(at(0, 10, 44));
  expect(tickCount(hourly, 'styleLessonsQueued')).toBe(1);
  const [lesson] = await all<{ id: string; text: string; status: string; drafts: number }>(
    `SELECT id, text, status, (SELECT count(DISTINCT generation_id) FROM ai_style_sources WHERE lesson_id = ai_style_lessons.id) AS drafts
     FROM ai_style_lessons`
  );
  expect(lesson).toMatchObject({ text: LESSON, status: 'asked', drafts: 3 });
  await world.flush(at(0, 11, 8));
  expect(world.buttonsOf('Похоже, вы всегда так правите')).toEqual([`sp:${lesson?.id}:ok`, `sp:${lesson?.id}:no`]);
  return lesson?.id ?? '';
}

const linkOrigin = async (day: number) =>
  (await one<{ origin: string }>('SELECT origin FROM content_ai_links WHERE content_item_id = ?', `youtube:${day}`))
    ?.origin ?? null;

beforeEach(async () => {
  await resetDb();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AI scenarios from start to end', () => {
  it('four weeks day by day: collection, reports, reviews, forecasts, weekly rules, the question, the prompt', async () => {
    const world = createWorld(rotation);
    await world.setUp({ dailyReport: true, videoReviews: true });
    let promptBeforeApproval = '';
    let promptAfterApproval = '';
    let ruleId = '';

    for (let day = 0; day < DAYS; day += 1) {
      const monday = day % 7 === 6;
      await world.tick(at(day, 0, 3));
      await world.tick(at(day, 6, 3));
      await world.link(day);
      // The owner confirms the match the bot reported, so the video teaches the weekly rules.
      const { confirm } = world.linkButtons(day);
      if (day >= 5) {
        if (confirm === undefined) throw new Error(`Video ${day} was not linked on its own`);
        expect(await world.tap(confirm)).toContain('снят по этому сценарию');
      }

      const report = await world.tick(at(day, 7, 2));
      expect(tickCount(report, monday ? 'weeklyReportRaised' : 'dailyReportRaised')).toBe(1);
      expect(tickCount(report, 'dailyReviewQueued')).toBe(1);
      await world.flush(at(day, 7, 8));
      await world.tick(at(day, 8, 14));

      if (day === 6) {
        // The first Monday: no video has a result yet, so the rules are not weighed and the model is not paid.
        expect(world.model.of('rule_consolidation')).toHaveLength(0);
      }
      if (day === 13) {
        // Two hits of the rubric were above the usual: the rule is found, still only a guess, and nobody is asked.
        expect(world.model.of('rule_consolidation')).toHaveLength(1);
        expect(await rules()).toMatchObject([{ text: TECHNIQUE, scope: 'igrat', status: 'candidate', approved: 0 }]);
        expect(await count("SELECT count(*) AS n FROM content_alerts WHERE id LIKE 'rule:%'")).toBe(0);
      }
      if (day === 20) {
        // The next week's hit confirms it on new numbers: the owner is asked, once, and the rule waits for the answer.
        const [rule] = await rules();
        expect(rule).toMatchObject({ text: TECHNIQUE, approved: 0 });
        expect(['supported', 'strong']).toContain(rule?.status);
        ruleId = rule?.id ?? '';
        const answers = world.buttonsOf('Похоже, работает в');
        expect(answers).toEqual([`rl:${ruleId}:ok`, `rl:${ruleId}:no`]);
        promptBeforeApproval = world.lastDraftPrompt();
        expect(promptBeforeApproval).not.toContain(TECHNIQUE);
        expect(await world.tap(`rl:${ruleId}:ok`)).toBe('Учту в новых сценариях.');
        expect(await rules()).toMatchObject([{ id: ruleId, approved: 1 }]);
      }

      await world.tick(at(day, 12, 3));
      await world.tick(at(day, 18, 3));
      // In the evening the owner writes the script for tomorrow's video.
      world.clock.set(at(day, 18, 30));
      if (day + 1 >= 5 && day + 1 < DAYS) {
        await world.writeScript(day + 1);
        if (day === 20) promptAfterApproval = world.lastDraftPrompt();
      }
    }

    // Reports: a daily one each day but the four Mondays, which have the weekly one; every one reviewed and sent.
    expect(
      await count("SELECT count(*) AS n FROM content_daily_reports WHERE id LIKE 'daily:%' AND status = 'reviewed'")
    ).toBe(DAYS - 4);
    expect(
      await count("SELECT count(*) AS n FROM content_daily_reports WHERE id LIKE 'weekly:%' AND status = 'reviewed'")
    ).toBe(4);
    expect(await count("SELECT count(*) AS n FROM content_alerts WHERE status <> 'sent'")).toBe(0);
    expect(await count("SELECT count(*) AS n FROM content_alerts WHERE id LIKE 'daily:%' OR id LIKE 'weekly:%'")).toBe(
      DAYS
    );

    // Forecasts: made with the reports, then given the real reading at their horizon, and the next report says so.
    expect(await count('SELECT count(*) AS n FROM content_forecasts')).toBeGreaterThan(0);
    const scored = await all<{
      fact: number;
      low: number;
      high: number;
      outcome: string;
      target: number;
      item: string;
    }>(
      `SELECT fact, low, high, outcome, target_at AS target, item_id AS item FROM content_forecasts
       WHERE scored_at IS NOT NULL AND outcome IN ('in_band', 'below', 'above')`
    );
    expect(scored.length).toBeGreaterThan(0);
    // The daily message no longer says how they scored (owner, 22.10.2026: the layout without it); the studio does.
    for (const row of scored)
      expect(row.outcome).toBe(row.fact < row.low ? 'below' : row.fact > row.high ? 'above' : 'in_band');

    // Reviews: a hit is above the rubric's usual at 72 hours, a miss below it, each with the model's hypotheses.
    const positions = await all<{ id: string; position: string; status: string; hypotheses: string }>(
      `SELECT item_id AS id, json_extract(observation_json, '$.position') AS position, status, hypotheses_json AS hypotheses
       FROM ai_video_reviews WHERE item_id IN (SELECT content_item_id FROM content_ai_links)`
    );
    for (const review of positions) {
      const kind = rotation(Number(review.id.split(':')[1]));
      expect(review.status).toBe('ready');
      if (kind === 'hit') expect(review.position).toBe('above');
      if (kind === 'miss') expect(review.position).toBe('below');
      expect(JSON.parse(review.hypotheses)).toHaveLength(1);
    }

    // The rule reached the next draft's prompt after the owner's «Учитывать», and not before.
    expect(promptAfterApproval).toContain('ПРАВИЛА АВТОРА');
    expect(promptAfterApproval).toContain(`- (из аналитики) ${TECHNIQUE}`);
    // It was asked once and stayed asked-and-answered through the next weeks' runs.
    expect(await count("SELECT count(*) AS n FROM content_alerts WHERE id LIKE 'rule:%'")).toBe(1);
    expect(await rules()).toMatchObject([{ id: ruleId, approved: 1 }]);
    expect(world.model.of('rule_consolidation')).toHaveLength(3);
    expect(world.lastDraftPrompt()).toContain(`- (из аналитики) ${TECHNIQUE}`);
  }, 600_000);

  describe('the owner edits AI drafts', () => {
    it('five edits become one question, «Учитывать» makes the rule, and the next prompt has it', async () => {
      const world = createWorld(() => 'base', 0);
      await world.setUp({ dailyReport: false, videoReviews: false });
      const id = await askedLesson(world);

      // The next hour's job reads the other two edits: they confirm the same lesson and ask nothing new.
      const next = await world.tick(at(0, 11, 44));
      expect(tickCount(next, 'styleLessonsQueued')).toBe(1);
      expect(
        await count('SELECT count(DISTINCT generation_id) AS n FROM ai_style_sources WHERE lesson_id = ?', id)
      ).toBe(5);
      expect(await count("SELECT count(*) AS n FROM content_alerts WHERE id LIKE 'style:%'")).toBe(1);
      const idle = await world.tick(at(0, 12, 44));
      expect(tickCount(idle, 'styleLessonsQueued')).toBe(0);

      expect(await world.tap(`sp:${id}:ok`)).toBe('Учту в новых текстах.');
      expect(await all('SELECT text, scope, status, source FROM ai_rules')).toEqual([
        { text: LESSON, scope: 'igrat', status: 'active', source: 'owner' }
      ]);
      for (const call of world.model.of('writer_answer')) expect(call.input).not.toContain(LESSON);
      await world.ask(task(6), scriptOf(6, 'mid'));
      expect(world.lastDraftPrompt()).toContain('ПРАВИЛА АВТОРА');
      expect(world.lastDraftPrompt()).toContain(`- ${LESSON}`);
    }, 120_000);

    it('«Нет» turns the lesson down for good: more of the same edit never asks again', async () => {
      const world = createWorld(() => 'base', 0);
      await world.setUp({ dailyReport: false, videoReviews: false });
      const id = await askedLesson(world);
      expect(await world.tap(`sp:${id}:no`)).toBe('Не буду учитывать.');

      // Two edits wait unread and two more come: the model, which does not obey its prompt, offers the lesson again.
      await edit(world, 5, 7);
      await world.tick(at(0, 11, 44));
      await world.tick(at(0, 12, 44));
      const reads = world.model.of('style_lesson');
      expect(reads).toHaveLength(7);
      for (const read of reads.slice(3)) expect(read.input).toContain(`ОТКЛОНЕНЫ АВТОРОМ (не предлагай):\n- ${LESSON}`);
      expect(await all('SELECT id, status FROM ai_style_lessons')).toEqual([{ id, status: 'rejected' }]);
      expect(await count("SELECT count(*) AS n FROM ai_style_sources WHERE outcome = 'none'")).toBe(4);
      expect(await count("SELECT count(*) AS n FROM content_alerts WHERE id LIKE 'style:%'")).toBe(1);
      expect(await count('SELECT count(*) AS n FROM ai_rules')).toBe(0);
      await world.ask(task(8), scriptOf(8, 'mid'));
      expect(world.lastDraftPrompt()).not.toContain(LESSON);
    }, 120_000);
  });

  it("a script and its video: matched on its own, «✅ Верно» makes the owner's link that teaches rules, «Не тот сценарий» removes it", async () => {
    const kinds: Record<number, Kind> = { 5: 'hit', 6: 'miss', 7: 'hit', 8: 'hit', 9: 'hit' };
    const world = createWorld((day) => (day < 5 ? 'base' : (kinds[day] ?? 'mid')), 10);
    await world.setUp({ dailyReport: false, videoReviews: true });

    for (let day = 0; day < 13; day += 1) {
      await world.tick(at(day, 6, 3));
      if (day <= 9) await world.link(day);
      if (day >= 5 && day <= 9) {
        // The bot matched the script by the title alone: an automatic link with both buttons.
        expect(await linkOrigin(day)).toBe('auto');
        const { confirm, undo } = world.linkButtons(day);
        if (confirm === undefined || undo === undefined) throw new Error(`Video ${day} came without its buttons`);
        if (day <= 7) {
          expect(await world.tap(confirm)).toContain('снят по этому сценарию');
          expect(await linkOrigin(day)).toBe('owner');
          // The old buttons are stale once the owner has spoken.
          expect(await world.tap(undo)).toBe('Эта кнопка устарела.');
        }
        if (day === 9) {
          expect(await world.tap(undo)).toBe('Отвязал. Ролик теперь без сценария.');
          expect(await linkOrigin(day)).toBeNull();
          expect(await world.tap(undo)).toBe('Эта кнопка устарела.');
          expect(await world.tap(confirm)).toBe('Эта кнопка устарела.');
        }
      }
      await world.tick(at(day, 8, 14));
      world.clock.set(at(day, 18, 30));
      if (day + 1 >= 5 && day + 1 <= 9) await world.writeScript(day + 1);
    }
    // Video 8 stays an automatic link nobody confirmed.
    expect(await linkOrigin(8)).toBe('auto');

    const weekly = await world.tick(at(13, 7, 2));
    expect(tickCount(weekly, 'weeklyReportRaised')).toBe(1);

    // The weekly run read the owner's three links: not the unconfirmed one, not the removed one.
    const [read, ...rest] = world.model.of('rule_consolidation');
    expect(rest).toHaveLength(0);
    expect(read?.input.match(/^v\d+ /gm)).toHaveLength(3);
    for (const day of [5, 6, 7]) expect(read?.input).toContain(`${hero(day)}: `);
    for (const day of [8, 9]) expect(read?.input).not.toContain(`${hero(day)}: `);
    expect(
      await all(
        'SELECT item_id, status, limited_reason FROM ai_video_reviews WHERE item_id IN (?, ?) ORDER BY item_id',
        'youtube:8',
        'youtube:9'
      )
    ).toEqual([
      { item_id: 'youtube:8', status: 'ready', limited_reason: null },
      { item_id: 'youtube:9', status: 'limited', limited_reason: 'no_script' }
    ]);
    // The rule the two hits teach rests on the two owner-confirmed scripts only.
    const [rule] = await rules();
    expect(rule).toMatchObject({ text: TECHNIQUE, scope: 'igrat', status: 'candidate' });
    const revisions = await all<{ key: string }>(
      "SELECT 'script:' || revision_id AS key FROM content_ai_links WHERE content_item_id IN ('youtube:5', 'youtube:7')"
    );
    const evidence = await all<{ key: string }>(
      'SELECT evidence_key AS key FROM ai_rule_evidence WHERE rule_id = ?',
      rule?.id
    );
    expect(new Set(evidence.map((row) => row.key))).toEqual(new Set(revisions.map((row) => row.key)));
  }, 300_000);
});
