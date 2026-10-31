import type { BotSetting, CreatePostInput } from '@alexeev/contracts';
import { POST_BODY_MAX } from '@alexeev/contracts';
import { Bot, type Context, GrammyError, InlineKeyboard, type NextFunction } from 'grammy';
import type { Message, UserFromGetMe } from 'grammy/types';
import type { PublicationStatus } from '@alexeev/contracts';
import { AppError } from '../../shared/app-error';
import type { Clock } from '../../platform/clock';
import type { Logger } from '../../platform/logging/logger';
import type { TelegramBotAdminApi } from '../../integrations/telegram/telegram-api';
import { parseOwnerTelegramId } from '../../modules/identity';
import type { AppEnv } from '../env';
import { parseEnvBotInfo } from './bot-info';
import type { BotIdentityStore } from './bot-identity-store';
import { draftFromCaption, draftFromMessageText, draftFromPoll, mediaOnlyDraft } from './draft-from-message';
import { type BotMediaFile, mediaLimit } from './media-import';
import { ALBUM_SETTLE_MS } from './media-import-worker';
import { CALLBACK_PREFIX, type PublishActions, type PublishOutcome } from './publish-actions';
import {
  publishKeyboard,
  SCHEDULE_PREFIX,
  type ScheduleChoice,
  scheduleDataOf,
  scheduleKeyboard
} from './publish-keyboard';
import { describeTime, parseScheduleTime } from './schedule-time';
import { configureOwnerChat } from './owner-chat';
import type { OwnerReply, OwnerReports } from './owner-reports';
import type { TelegramCaller } from './telegram-call';
import type { UpdateDedup } from './update-dedup';
import type { RulesRepository, StyleLessonsRepository, WriterDeps } from '../../modules/ai';
import { CONTAMINATION_CALLBACK, parseContaminationCallback } from '../../modules/content-analytics';
import type { AiJob } from './ai-job';
import { NO_MODE_TEXT, registerAiWriter, REQUEST_TTL_MS } from './ai-writer';
import { registerAiRules } from './ai-rules';
import { SCRIPT_PROMPT_CALLBACK, type ScriptPromptReply } from '../workflows/script-prompts';

export interface BotSettings {
  token: string;
  webhookSecret: string;
  ownerId: number;
}

export interface BotConfig extends BotSettings {
  botInfo: UserFromGetMe;
}

// What Telegram accepts as `secret_token`; any other value could never reach the webhook header.
const WEBHOOK_SECRET_PATTERN = /^[A-Za-z0-9_-]{1,256}$/;

export interface BotSetup {
  /** The settings that come from the Worker environment, or null while any is missing or malformed. */
  settings: BotSettings | null;
  /** `settings` plus the bot identity; null while either is incomplete: the webhook then answers 503. */
  config: BotConfig | null;
  /** Names of the settings that are missing or malformed (never their values). A bot identity that was
   * never stored is not listed: connecting stores it. Only a malformed BOT_INFO override is. */
  missing: BotSetting[];
  /** From the BOT_INFO override or the stored identity, even if another setting is missing. */
  botUsername: string | null;
}

// A bot token is `<bot id>:<secret>`, so the id says which bot the token belongs to.
function tokenBotId(token: string): number | null {
  const match = /^(\d+):/.exec(token);
  return match?.[1] === undefined ? null : Number(match[1]);
}

// Pure: `stored` is the identity saved by connect (see `loadBotSetup`). A valid BOT_INFO override wins;
// a stored identity of another bot (the token was replaced since) is not used.
export function inspectBotSetup(env: AppEnv, stored: UserFromGetMe | null): BotSetup {
  const ownerId = parseOwnerTelegramId(env.OWNER_TELEGRAM_ID);
  // A token that is only whitespace (a pasted secret with a stray newline) is no token.
  const token = env.TELEGRAM_BOT_TOKEN?.trim();
  const webhookSecret = env.TELEGRAM_WEBHOOK_SECRET;

  const override = parseEnvBotInfo(env.BOT_INFO);
  const tokenId = token ? tokenBotId(token) : null;
  // A token without a readable bot id cannot vouch for a stored identity, so none is used.
  const usableStored = stored !== null && tokenId !== null && stored.id === tokenId ? stored : null;
  const botInfo = override.state === 'valid' ? override.info : usableStored;

  const missing: BotSetting[] = [];
  if (!token) missing.push('TELEGRAM_BOT_TOKEN');
  if (!webhookSecret || !WEBHOOK_SECRET_PATTERN.test(webhookSecret)) missing.push('TELEGRAM_WEBHOOK_SECRET');
  if (override.state === 'malformed') missing.push('BOT_INFO');
  if (ownerId === null) missing.push('OWNER_TELEGRAM_ID');

  const settings =
    missing.length === 0 && token && webhookSecret && ownerId !== null ? { token, webhookSecret, ownerId } : null;
  return {
    settings,
    config: settings !== null && botInfo !== null ? { ...settings, botInfo } : null,
    missing,
    botUsername: botInfo?.username ?? null
  };
}

// Reads the stored identity only when no BOT_INFO override is set: one primary-key lookup, never `getMe`.
export async function loadBotSetup(
  env: AppEnv,
  store: BotIdentityStore,
  log: { logger: Logger; requestId?: string }
): Promise<BotSetup> {
  const stored = parseEnvBotInfo(env.BOT_INFO).state === 'absent' ? await store.load() : null;
  const tokenId = tokenBotId(env.TELEGRAM_BOT_TOKEN?.trim() ?? '');
  if (stored !== null && tokenId !== null && stored.id !== tokenId) {
    // Ids only identify bots, they are no secret, but the log carries the code alone.
    log.logger.warn({
      component: 'bot',
      operation: 'bot_identity.load',
      requestId: log.requestId,
      errorCode: 'BOT_IDENTITY_MISMATCH'
    });
  }
  return inspectBotSetup(env, stored);
}

// The bot is personal: updates from anyone but the owner are dropped without an answer.
function ownerOnly(ownerId: number) {
  return async (ctx: Context, next: NextFunction): Promise<void> => {
    if (ctx.from?.id === ownerId) await next();
  };
}

export interface BotRuntime {
  /** The channel's reactions, poll votes and comments (rubric scheduler stage 2); absent: those updates are dropped. */
  audience?: { wants(update: unknown): boolean; handle(update: unknown): Promise<void> };
  /** Where posts sent straight to the channel are kept (migration 0125); absent: they are dropped. */
  channelPosts?: { record(chatId: string, messageId: number, at: number): Promise<void> };
  /** This Worker's public origin: where the studio button points. */
  appOrigin: string;
  clock: Clock;
  /** The owner's updates are processed at most once each. */
  updates: UpdateDedup;
  /** The answer of /status. */
  reports: OwnerReports;
  /** The AI writer's rules (AI plan P7): «/rule» and «/rules». */
  rules: () => Promise<RulesRepository>;
  /** What the owner's edits teach (AI plan P7c): «✅ Учитывать» / «Нет» under a lesson. */
  styleLessons: () => Promise<StyleLessonsRepository>;
  /** A tap on «Снят по этому сценарию?» or «Привязал сценарий» (owner, 19.10.2026). */
  scriptPromptTap: (data: string) => Promise<ScriptPromptReply>;
  /** «Аналитика сейчас» (AI plan P6): the daily table at this moment; never a second daily report. */
  analyticsNow: () => Promise<OwnerReply>;
  /** Stores a draft post; a repeated key returns the same post. Throws `AppError` or a D1 error. */
  /** `richHtml`: the approved rich format of an AI post (app/bot/rich-post.ts), sent instead of the text. */
  createDraft: (
    input: CreatePostInput,
    idempotencyKey: string,
    richHtml?: string
  ) => Promise<{ id: string; revision: number }>;
  /** The «publish now» buttons under a draft reply and what a tap does. */
  publish: PublishActions;
  /** The owner confirmed under an alert why a video's numbers are distorted. Throws `AppError` NOT_FOUND. */
  contamination: (itemId: string, reason: 'restricted' | 'removed') => Promise<void>;
  /** The AI writer's dependencies, built on first use (they read the owner's time zone). */
  writer: () => Promise<WriterDeps>;
  /** Records the file in D1 (fast) and starts the import after the webhook answered. */
  mediaImports: {
    /** `first` is true for the update that made the draft's import record: the only one that answers. */
    enqueue: (input: {
      postId: string;
      file: BotMediaFile;
      messageId: number;
      /** The album's caption as a draft input; the worker applies it, so no update races on the revision. */
      caption: CreatePostInput | null;
      oversized: boolean;
      /** The item's caption was over the post limit: never cut, so the file is kept and the report says so. */
      captionTooLong: boolean;
    }) => Promise<{ first: boolean }>;
    /** Runs the import in the background; `settleMs` lets the rest of an album arrive first. */
    start: (postId: string, settleMs: number) => void;
  };
  /** Keeps this Worker's public origin for Cron's owner alerts, which have no request to learn it from. */
  rememberAppOrigin: (origin: string) => Promise<void>;
  /** Used by /start to refresh the owner's commands and menu button. */
  adminApi: TelegramBotAdminApi;
  call: TelegramCaller;
  /** Sends one AI writer model call to the AI_JOBS queue. */
  enqueueAiJob: (job: AiJob) => Promise<void>;
  /** An approved AI draft of a source event becomes that event's post. */
  linkSourceEventPost: (generationIds: readonly string[], postId: string) => Promise<void>;
  /** Keeps work alive after the webhook answered (the request's `ctx.waitUntil`). */
  waitUntil: (work: Promise<unknown>) => void;
  /** Records a failed update (stable code only); the webhook still answers 200. */
  onError: (error: unknown) => void;
}

// Every Bot API call of the reply path gives up after this long, so the whole handler stays well
// under the webhook's 10 s deadline (grammY's own default is 500 s).
const REPLY_TIMEOUT_SECONDS = 4;

const START_TEXT = 'Студия на связи. Откройте её кнопкой ниже.';
const REPORT_FAILED_TEXT = 'Не удалось получить данные. Попробуйте ещё раз.';
const DRAFT_FAILED_TEXT = 'Не удалось создать черновик. Отправьте текст ещё раз.';
const DRAFT_CREATED_TEXT = 'Черновик создан';
const POLL_DRAFT_CREATED_TEXT = 'Черновик-опрос создан';
const MEDIA_DRAFT_CREATED_TEXT = 'Черновик создан, файлы загружаются…';
const DRAFT_TOO_LONG_TEXT = `Текст длиннее ${POST_BODY_MAX} символов, черновик не создан.`;
const CHANGED_TEXT = 'Пост изменился — откройте в Студии';
const IMPORTING_TEXT = 'Файлы или картинка ещё готовятся — нажмите чуть позже или откройте в Студии';
const DUPLICATE_TEXT = 'Уже в очереди или опубликовано в этом канале — откройте в Студии';
const EXPIRED_TEXT = 'Кнопка устарела, откройте в Студии';
const ASK_TIME_TEXT = (timezone: string) =>
  `Когда опубликовать? Напишите как удобно: «завтра в 2 дня», «в 19:00», «через 2 часа», «в пятницу в 10», «20.10 18:00». Время по поясу ${timezone}.`;
const TIME_NOT_UNDERSTOOD_TEXT =
  'Не понял время. Например: «завтра в 2 дня», «в 19:00», «через 2 часа», «20.10 18:00». Или нажмите «Отмена».';
const TIME_PAST_TEXT = 'Это время уже прошло. Напишите другое или нажмите «Отмена».';
const SCHEDULE_CANCELLED_TEXT = 'Планирование отменено';
const TIME_TOO_FAR_TEXT =
  'Можно запланировать не дальше чем на год вперёд. Напишите другое время или нажмите «Отмена».';
/** The server's window: up to 366 days ahead. */
const SCHEDULE_MAX_AHEAD_MS = 366 * 24 * 60 * 60_000;
/** A typed time is a short line; anything longer is a post or a question, not a time. */
const TIME_TEXT_MAX = 40;
/** A chosen time this close to now is a «now» the owner did not ask for: asked again instead. */
const SCHEDULE_MIN_AHEAD_MS = 60_000;
const SCHEDULE_CALLBACK = new RegExp(`^${SCHEDULE_PREFIX}([A-Za-z0-9]{8,32})(?::(h1|t19|m10|own|back|cancel))?$`);
const UNSUPPORTED_TEXT = 'Этот тип сообщения пока не превращается в черновик';
const DRAFT_INVALID_TEXT = 'Текст содержит недопустимые символы, черновик не создан.';
const CONTAMINATED_TEXT = 'Отмечено: ролик больше не входит в сравнения других роликов.';
const ITEM_GONE_TEXT = 'Ролик не найден в аналитике — откройте в Студии';
const MARK_FAILED_TEXT = 'Не удалось отметить. Попробуйте ещё раз.';

// Only private chats with the owner: the bot never answers in a group the owner happens to share with it.
function privateChatOnly() {
  return async (ctx: Context, next: NextFunction): Promise<void> => {
    if (ctx.chat?.type === 'private') await next();
  };
}

function replyWithButton(ctx: Context, answer: OwnerReply) {
  return ctx.reply(answer.html, {
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
    reply_markup: new InlineKeyboard().webApp(answer.button.text, answer.button.url)
  });
}

// Built per request: no user or update state lives in module scope.
export function createBot(config: BotConfig, runtime: BotRuntime): Bot {
  const bot = new Bot(config.token, {
    botInfo: config.botInfo,
    client: { timeoutSeconds: REPLY_TIMEOUT_SECONDS }
  });
  // First, so it sees every failure. `bot.catch` is not used by webhooks: `handleUpdate` rethrows,
  // the webhook would answer 500 and Telegram would redeliver an update whose reply may already be
  // out. A /start the owner did not get is simply sent again by the owner.
  bot.use(async (_ctx, next) => {
    try {
      await next();
    } catch (error) {
      runtime.onError(error);
    }
  });
  // A post the owner sent straight to the channel (the bot is its admin): only its time is kept, for the scheduler's gap.
  // Before the owner check, since a channel post has no sender; never answered, and a replay is a no-op.
  bot.use(async (ctx, next) => {
    const post = ctx.update.channel_post;
    if (post === undefined) return next();
    // A channel may be set up by its number or by @username: both are kept, so the gap is found either way.
    const username = 'username' in post.chat ? post.chat.username : undefined;
    const keys = [String(post.chat.id), ...(username === undefined ? [] : [`@${username}`])];
    for (const key of keys) await runtime.channelPosts?.record(key, post.message_id, post.date * 1000);
  });
  // Before the owner check: these updates are the audience's, never the owner's, and never get an answer. The branch
  // swallows its own failures, so the owner's flow is the same whether it works or not.
  bot.use(async (ctx, next) => {
    if (runtime.audience === undefined || !runtime.audience.wants(ctx.update)) return next();
    await runtime.audience.handle(ctx.update);
  });
  bot.use(ownerOnly(config.ownerId));
  bot.use(privateChatOnly());
  // After the owner check, so a stranger's update is never stored. A replay ends here without a reply.
  bot.use(async (ctx, next) => {
    if (await runtime.updates.claim(ctx.update.update_id, runtime.clock.now())) await next();
  });
  bot.command('start', async (ctx) => {
    await ctx.reply(START_TEXT, {
      reply_markup: new InlineKeyboard().webApp('Открыть студию', `${runtime.appOrigin}/`)
    });
    // Best effort and off the webhook's path: the reply above is what the owner needs. Awaiting two
    // more Telegram calls here could outlast the webhook deadline, answer 500 after the reply was
    // sent, and make Telegram redeliver the update (a second reply). A failure is already logged by
    // `call` with a stable code, so it is only kept from becoming an unhandled rejection.
    runtime.waitUntil(
      runtime
        .rememberAppOrigin(runtime.appOrigin)
        .catch((error: unknown) => runtime.onError(error))
        .then(() => configureOwnerChat({ api: runtime.adminApi, call: runtime.call }, { ownerId: config.ownerId }))
        .catch(() => undefined)
    );
  });

  // A failed read is answered, not swallowed: the owner asked and would otherwise wait for nothing.
  const report = (load: () => Promise<OwnerReply>) => async (ctx: Context) => {
    let answer: OwnerReply;
    try {
      answer = await load();
    } catch (error) {
      runtime.onError(error);
      await ctx.reply(REPORT_FAILED_TEXT);
      return;
    }
    await replyWithButton(ctx, answer);
  };
  bot.command(
    'status',
    report(() => runtime.reports.status())
  );
  bot.command(
    'analytics',
    report(() => runtime.analyticsNow())
  );

  // Before the plain draft handler: a request for a text or a reply to an AI draft is the writer's.
  // «Своё время» under «🕒»: the next text is the time (before the AI writer, which would take it as a request).
  bot.on('message:text', async (ctx, next) => {
    // A command, or a reply (an edit of an AI draft, the answer to its question), is never the time.
    if (ctx.message.text.startsWith('/') || ctx.message.reply_to_message !== undefined) return next();
    const token = await runtime.publish.awaitingTime();
    if (token === null) return next();
    // A time is a short line. A longer text is the owner moving on (a post saying «стрим в 20:00» must not
    // schedule the earlier draft): the wait ends and the text goes on as usual.
    if (ctx.message.text.length > TIME_TEXT_MAX || ctx.message.text.includes('\n')) {
      await runtime.publish.stopAwaitingTime(token);
      return next();
    }
    const timezone = await runtime.publish.timezone();
    const now = runtime.clock.now();
    const parsed = parseScheduleTime(ctx.message.text, now, timezone);
    const cancel = { inline_keyboard: [[{ text: 'Отмена', callback_data: scheduleDataOf(token, 'cancel') }]] };
    if (!parsed.ok) {
      await ctx.reply(TIME_NOT_UNDERSTOOD_TEXT, { reply_markup: cancel });
      return;
    }
    if (parsed.at < now + SCHEDULE_MIN_AHEAD_MS) {
      await ctx.reply(TIME_PAST_TEXT, { reply_markup: cancel });
      return;
    }
    // Asked before the claim: a time the server refuses would fix it on the token and kill «сейчас» too.
    if (parsed.at > now + SCHEDULE_MAX_AHEAD_MS) {
      await ctx.reply(TIME_TOO_FAR_TEXT, { reply_markup: cancel });
      return;
    }
    await runtime.publish.stopAwaitingTime(token);
    const outcome = await runtime.publish.perform(token, parsed.at);
    if (outcome.kind === 'busy') return;
    const { text, postId, markup } = await outcomeMessage(outcome);
    await ctx.reply(text, {
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
      ...(markup === undefined || postId === null ? {} : { reply_markup: markup })
    });
  });

  // Before the writer: in a /redactor chat its text handler would take «/rule …» as a message to the editor.
  registerAiRules(bot, {
    clock: runtime.clock,
    newId: () => crypto.randomUUID(),
    rules: runtime.rules,
    lessons: runtime.styleLessons,
    onError: runtime.onError
  });
  registerAiWriter(bot, runtime);

  // In /post mode whatever the owner sends or forwards becomes a draft. An unknown command is not a post.
  const draftReplyOptions = async (post: { id: string; revision: number }) => {
    const markup = publishKeyboard({
      appOrigin: runtime.appOrigin,
      postId: post.id,
      buttons: await runtime.publish.buttons(post),
      studio: 'post'
    });
    return markup === undefined ? {} : { reply_markup: markup };
  };

  bot.on('message:text', async (ctx) => {
    if (ctx.message.entities?.some((entity) => entity.type === 'bot_command' && entity.offset === 0)) return;
    const draft = draftFromMessageText(ctx.message.text, ctx.message.entities);
    if (!draft.ok) {
      await ctx.reply(draft.reason === 'TOO_LONG' ? DRAFT_TOO_LONG_TEXT : DRAFT_INVALID_TEXT);
      return;
    }
    let post: { id: string; revision: number };
    try {
      // The update id as the key: a replay that slipped past the dedup still cannot create a second draft.
      post = await runtime.createDraft(draft.input, `tg-update-${ctx.update.update_id}`);
    } catch (error) {
      runtime.onError(error);
      await ctx.reply(DRAFT_FAILED_TEXT);
      return;
    }
    await ctx.reply(DRAFT_CREATED_TEXT, await draftReplyOptions(post));
  });

  // A poll the owner made or forwarded in the chat becomes a poll draft (owner, 20.10.2026).
  bot.on('message:poll', async (ctx) => {
    // Like files, only in /post mode (owner, 16.10.2026).
    const now = runtime.clock.now();
    const mode = await (await runtime.writer()).writer.touchRequest(ctx.chat.id, now, now + REQUEST_TTL_MS);
    if (mode?.kind !== 'post') {
      await ctx.reply(NO_MODE_TEXT);
      return;
    }
    const draft = draftFromPoll(ctx.message.poll);
    if (!draft.ok) {
      await ctx.reply(DRAFT_INVALID_TEXT);
      return;
    }
    let post: { id: string; revision: number };
    try {
      post = await runtime.createDraft(draft.input, `tg-update-${ctx.update.update_id}`);
    } catch (error) {
      runtime.onError(error);
      await ctx.reply(DRAFT_FAILED_TEXT);
      return;
    }
    await ctx.reply(POLL_DRAFT_CREATED_TEXT, await draftReplyOptions(post));
  });

  // A photo, video or GIF with its caption. An album arrives as one update per file sharing a
  // `media_group_id`: they all resolve to the same draft through one idempotency key.
  bot.on(['message:photo', 'message:video', 'message:animation'], async (ctx) => {
    const message = ctx.message;
    // Files become drafts only in /post mode (owner, 16.10.2026). An album says so once (its captioned item).
    const now = runtime.clock.now();
    const mode = await (await runtime.writer()).writer.touchRequest(ctx.chat.id, now, now + REQUEST_TTL_MS);
    if (mode?.kind !== 'post') {
      if (message.media_group_id === undefined || message.caption !== undefined) await ctx.reply(NO_MODE_TEXT);
      return;
    }
    const file = mediaFileOf(message);
    if (file === null) return;
    const albumId = message.media_group_id;
    const parsed = draftFromCaption(message.caption, message.caption_entities);
    // A caption over the limit is not cut and does not drop the file: the draft is made without it and the
    // import report says so. One outcome, so no «too long» answer next to «draft created».
    const captionTooLong = !parsed.ok && parsed.reason === 'TOO_LONG';
    if (!parsed.ok && !captionTooLong) {
      await ctx.reply(DRAFT_INVALID_TEXT);
      return;
    }
    const draft = parsed.ok ? parsed : { ok: true as const, input: mediaOnlyDraft() };
    let post: { id: string; revision: number };
    let first: boolean;
    try {
      post =
        albumId === undefined
          ? await runtime.createDraft(draft.input, `tg-update-${ctx.update.update_id}`)
          : await createAlbumDraft(albumId);
      ({ first } = await runtime.mediaImports.enqueue({
        postId: post.id,
        file,
        messageId: message.message_id,
        caption: albumId !== undefined && message.caption !== undefined && !captionTooLong ? draft.input : null,
        oversized: file.size !== null && file.size > mediaLimit(file.kind),
        captionTooLong
      }));
    } catch (error) {
      runtime.onError(error);
      await ctx.reply(DRAFT_FAILED_TEXT);
      return;
    }
    // Registered before the reply: if the reply fails, the file is still imported.
    runtime.mediaImports.start(post.id, albumId === undefined ? 0 : ALBUM_SETTLE_MS);
    // One answer per draft: the others of an album stay silent.
    // No publish buttons here: the files are not attached yet, and the report that follows carries them.
    if (first) {
      const markup = publishKeyboard({ appOrigin: runtime.appOrigin, postId: post.id, buttons: [], studio: 'post' });
      await ctx.reply(MEDIA_DRAFT_CREATED_TEXT, markup === undefined ? {} : { reply_markup: markup });
    }
  });

  // The album's first update makes the draft; the others find it by the same key. The payload is fixed
  // (the caption is applied afterwards), so concurrent updates agree on one draft. One that meets the first
  // still writing waits a moment and asks again.
  async function createAlbumDraft(albumId: string): Promise<{ id: string; revision: number }> {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await runtime.createDraft(mediaOnlyDraft(), `tg-album-${albumId}`);
      } catch (error) {
        const writing = error instanceof AppError && error.code === 'CONFLICT' && error.details?.reason === 'IN_FLIGHT';
        if (!writing || attempt === ALBUM_DRAFT_ATTEMPTS) throw error;
        await new Promise((resolve) => setTimeout(resolve, ALBUM_DRAFT_WAIT_MS));
      }
    }
  }

  // A tap on «publish now». Answered first (Telegram shows a spinner until then); the work follows and
  // the result is written into the message itself. The bot never sends: it asks for a publication.
  bot.callbackQuery(new RegExp(`^${CALLBACK_PREFIX}([A-Za-z0-9]{8,32})$`), async (ctx) => {
    await ctx.answerCallbackQuery().catch((error: unknown) => runtime.onError(error));
    const outcome = await runtime.publish.perform(ctx.match[1] ?? '');
    if (outcome.kind === 'busy') return;
    await writeOutcome(ctx, outcome);
  });

  /** The outcome's words, with the time in the owner's zone for a scheduled one, and its one button. */
  async function outcomeMessage(outcome: Exclude<PublishOutcome, { kind: 'busy' }>) {
    const now = runtime.clock.now();
    const when =
      outcome.kind === 'queued' && outcome.status === 'scheduled'
        ? describeTime(outcome.scheduledAt, now, await runtime.publish.timezone())
        : null;
    const { text, postId } = outcomeText(outcome, when);
    // Queued or already on its way: its publications, never the publish screen again.
    const studio = outcome.kind === 'queued' || outcome.kind === 'duplicate' ? 'publications' : 'post';
    const markup =
      postId === null
        ? undefined
        : publishKeyboard({
            appOrigin: runtime.appOrigin,
            postId,
            buttons: [],
            studio,
            publicationId: outcome.kind === 'queued' || outcome.kind === 'duplicate' ? outcome.publicationId : null
          });
    return { text, postId, markup };
  }

  async function writeOutcome(ctx: Context, outcome: Exclude<PublishOutcome, { kind: 'busy' }>) {
    const { text, markup } = await outcomeMessage(outcome);
    try {
      await ctx.editMessageText(text, {
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
        ...(markup === undefined ? {} : { reply_markup: markup })
      });
    } catch (error) {
      // A repeated tap writes the same text again; Telegram calls that an error, it is not one.
      if (!(error instanceof GrammyError && error.description.includes('message is not modified'))) throw error;
    }
  }

  // «🕒 Запланировать»: the choices replace the draft's buttons; a choice publishes at that time through the same
  // token (so the same refusals and the duplicate guard apply); «Своё время» waits for the next message.
  bot.callbackQuery(SCHEDULE_CALLBACK, async (ctx) => {
    const token = ctx.match[1] ?? '';
    const choice = ctx.match[2] as ScheduleChoice | undefined;
    const now = runtime.clock.now();
    const timezone = await runtime.publish.timezone();
    const swap = async (markup: Parameters<Context['editMessageReplyMarkup']>[0]) => {
      try {
        await ctx.editMessageReplyMarkup(markup);
      } catch (error) {
        if (!(error instanceof GrammyError && error.description.includes('message is not modified'))) throw error;
      }
    };
    if (choice === 'cancel') {
      await runtime.publish.stopAwaitingTime(token);
      await ctx
        .answerCallbackQuery({ text: SCHEDULE_CANCELLED_TEXT })
        .catch((error: unknown) => runtime.onError(error));
      await swap(undefined);
      return;
    }
    await ctx.answerCallbackQuery().catch((error: unknown) => runtime.onError(error));
    if (choice === undefined) {
      const evening = parseScheduleTime('сегодня в 19:00', now, timezone);
      await swap({
        reply_markup: scheduleKeyboard(token, { evening: evening.ok && evening.at > now + SCHEDULE_MIN_AHEAD_MS })
      });
      return;
    }
    if (choice === 'back') {
      const found = await runtime.publish.buttonsFor(token);
      const markup =
        found === null
          ? undefined
          : publishKeyboard({
              appOrigin: runtime.appOrigin,
              postId: found.postId,
              buttons: found.buttons,
              studio: 'post'
            });
      await swap(markup === undefined ? undefined : { reply_markup: markup });
      return;
    }
    if (choice === 'own') {
      // One wait at a time: «Своё время» ends a «✏️ Изменить», a note or a remark wait of the AI editor here.
      const chatId = ctx.chat?.id;
      if (chatId !== undefined) {
        const { writer } = await runtime.writer();
        await writer.setEditing({ chatId, generationId: null, now, expiresAt: now });
        await writer.setNoting({ chatId, feedbackId: null, now, expiresAt: now });
        await writer.setFixing({ chatId, generationId: null, now, expiresAt: now });
      }
      if (!(await runtime.publish.awaitTime(token))) {
        await writeOutcome(ctx, { kind: 'expired', postId: null });
        return;
      }
      await ctx.reply(ASK_TIME_TEXT(timezone), {
        reply_markup: { inline_keyboard: [[{ text: 'Отмена', callback_data: scheduleDataOf(token, 'cancel') }]] }
      });
      return;
    }
    const picked =
      choice === 'h1'
        ? { ok: true as const, at: now + 60 * 60_000 }
        : parseScheduleTime(choice === 't19' ? 'сегодня в 19:00' : 'завтра в 10:00', now, timezone);
    if (!picked.ok || picked.at < now + SCHEDULE_MIN_AHEAD_MS) {
      await ctx.reply(TIME_PAST_TEXT);
      return;
    }
    const outcome = await runtime.publish.perform(token, picked.at);
    if (outcome.kind === 'busy') return;
    await writeOutcome(ctx, outcome);
  });

  // «Ограничение подтвердилось» under an alert: the tap is the owner's confirmation (architecture item 12).
  // Safe to repeat; on success the button leaves the message so it is not tapped again.
  bot.callbackQuery(SCRIPT_PROMPT_CALLBACK, async (ctx) => {
    let reply: ScriptPromptReply;
    try {
      reply = await runtime.scriptPromptTap(ctx.callbackQuery.data);
    } catch (error) {
      runtime.onError(error);
      await ctx.answerCallbackQuery({ text: MARK_FAILED_TEXT }).catch(() => undefined);
      return;
    }
    await ctx.answerCallbackQuery({ text: reply.notice }).catch((error: unknown) => runtime.onError(error));
    if (reply.edit === null) return;
    try {
      await ctx.editMessageText(reply.edit.html, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: reply.edit.buttons }
      });
    } catch (error) {
      if (!(error instanceof GrammyError && error.description.includes('message is not modified'))) throw error;
    }
  });

  bot.callbackQuery(CONTAMINATION_CALLBACK, async (ctx) => {
    const data = ctx.callbackQuery.data;
    const parsed = parseContaminationCallback(data);
    let text = EXPIRED_TEXT;
    if (parsed !== null) {
      try {
        await runtime.contamination(parsed.itemId, parsed.reason);
        text = CONTAMINATED_TEXT;
      } catch (error) {
        if (error instanceof AppError && error.code === 'NOT_FOUND') text = ITEM_GONE_TEXT;
        else {
          runtime.onError(error);
          text = MARK_FAILED_TEXT;
        }
      }
    }
    await ctx.answerCallbackQuery({ text }).catch((error: unknown) => runtime.onError(error));
    const keyboard = ctx.callbackQuery.message?.reply_markup?.inline_keyboard;
    if (text !== CONTAMINATED_TEXT || keyboard === undefined) return;
    const rows = keyboard
      .map((row) => row.filter((button) => !('callback_data' in button && button.callback_data === data)))
      .filter((row) => row.length > 0);
    try {
      await ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: rows } });
    } catch (error) {
      if (!(error instanceof GrammyError && error.description.includes('message is not modified'))) throw error;
    }
  });

  // Stickers, voice, documents and the rest: said once, no draft. Service messages (such as
  // `write_access_allowed`) carry none of these, so they get no answer.
  bot.on('message', async (ctx) => {
    if (UNSUPPORTED_CONTENT.some((key) => key in ctx.message)) await ctx.reply(UNSUPPORTED_TEXT);
  });
  return bot;
}

const UNSUPPORTED_CONTENT = [
  'sticker',
  'voice',
  'audio',
  'document',
  'video_note',
  'contact',
  'location',
  'venue',
  'dice',
  'game',
  'story',
  'invoice',
  'paid_media'
] as const;
const ALBUM_DRAFT_ATTEMPTS = 6;
const ALBUM_DRAFT_WAIT_MS = 300;

// A photo comes in several sizes: the biggest one that still fits the limit is imported.
function mediaFileOf(message: Message): BotMediaFile | null {
  if (message.photo !== undefined) {
    const limit = mediaLimit('photo');
    const sizes = [...message.photo].sort((a, b) => (b.file_size ?? 0) - (a.file_size ?? 0));
    const fitting = sizes.find((size) => (size.file_size ?? 0) <= limit) ?? sizes[sizes.length - 1];
    if (fitting === undefined) return null;
    return {
      fileId: fitting.file_id,
      uniqueId: fitting.file_unique_id,
      kind: 'photo',
      fileName: null,
      mimeType: 'image/jpeg',
      size: fitting.file_size ?? null
    };
  }
  const media = message.video ?? message.animation;
  if (media === undefined) return null;
  return {
    fileId: media.file_id,
    uniqueId: media.file_unique_id,
    kind: message.video === undefined ? 'animation' : 'video',
    fileName: media.file_name ?? null,
    mimeType: media.mime_type ?? null,
    size: media.file_size ?? null
  };
}

// What the server says about the publication, never more: «Опубликовано» is the dispatcher's word and is
// not used here at all.
const STATUS_LABEL: Record<PublicationStatus, string> = {
  scheduled: 'Поставлено в очередь',
  queued: 'Поставлено в очередь',
  preparing: 'Готовится к отправке',
  sending: 'Отправляется',
  retry_wait: 'Ожидает повторной отправки',
  sent: 'Отправлено',
  failed: 'Не отправлено',
  unknown: 'Результат неизвестен, проверьте в Студии',
  cancelled: 'Отменено'
};

const escapeHtml = (value: string): string =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

function outcomeText(
  outcome: Exclude<PublishOutcome, { kind: 'busy' }>,
  when: string | null
): { text: string; postId: string | null } {
  switch (outcome.kind) {
    case 'queued':
      return {
        text:
          when === null
            ? `${STATUS_LABEL[outcome.status]}: ${escapeHtml(outcome.channelTitle)}`
            : `Запланировано: ${escapeHtml(outcome.channelTitle)}, ${when}`,
        postId: outcome.postId
      };
    case 'changed':
      return { text: CHANGED_TEXT, postId: outcome.postId };
    case 'importing':
      return { text: IMPORTING_TEXT, postId: outcome.postId };
    case 'duplicate':
      return { text: DUPLICATE_TEXT, postId: outcome.postId };
    case 'expired':
      return { text: EXPIRED_TEXT, postId: outcome.postId };
  }
}
