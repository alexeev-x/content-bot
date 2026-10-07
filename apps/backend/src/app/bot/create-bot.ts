import type { BotSetting, CreatePostInput } from '@alexeev/contracts';
import { POST_BODY_MAX } from '@alexeev/contracts';
import { Bot, type Context, InlineKeyboard, type NextFunction } from 'grammy';
import type { UserFromGetMe } from 'grammy/types';
import type { Clock } from '../../platform/clock';
import type { Logger } from '../../platform/logging/logger';
import type { TelegramBotAdminApi } from '../../integrations/telegram/telegram-api';
import { parseOwnerTelegramId } from '../../modules/identity';
import type { AppEnv } from '../env';
import { parseEnvBotInfo } from './bot-info';
import type { BotIdentityStore } from './bot-identity-store';
import { draftFromMessageText } from './draft-from-message';
import { configureOwnerChat } from './owner-chat';
import type { OwnerReply, OwnerReports } from './owner-reports';
import type { TelegramCaller } from './telegram-call';
import type { UpdateDedup } from './update-dedup';

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
export function ownerOnly(ownerId: number) {
  return async (ctx: Context, next: NextFunction): Promise<void> => {
    if (ctx.from?.id === ownerId) await next();
  };
}

export const OPEN_BUTTON_TEXT = 'Открыть';

export interface BotRuntime {
  /** This Worker's public origin: where the studio button points. */
  appOrigin: string;
  clock: Clock;
  /** The owner's updates are processed at most once each. */
  updates: UpdateDedup;
  /** The answers of /today, /next and /status. */
  reports: OwnerReports;
  /** Stores a draft post; a repeated key returns the same post. Throws `AppError` or a D1 error. */
  createDraft: (input: CreatePostInput, idempotencyKey: string) => Promise<{ id: string }>;
  /** Keeps this Worker's public origin for Cron's owner alerts, which have no request to learn it from. */
  rememberAppOrigin: (origin: string) => Promise<void>;
  /** Used by /start to refresh the owner's commands and menu button. */
  adminApi: TelegramBotAdminApi;
  call: TelegramCaller;
  /** Keeps work alive after the webhook answered (the request's `ctx.waitUntil`). */
  waitUntil: (work: Promise<unknown>) => void;
  /** Records a failed update (stable code only); the webhook still answers 200. */
  onError: (error: unknown) => void;
}

// Every Bot API call of the reply path gives up after this long, so the whole handler stays well
// under the webhook's 10 s deadline (grammY's own default is 500 s).
const REPLY_TIMEOUT_SECONDS = 4;

const REPORT_FAILED_TEXT = 'Не удалось получить данные. Попробуйте ещё раз.';
const DRAFT_FAILED_TEXT = 'Не удалось создать черновик. Отправьте текст ещё раз.';
const DRAFT_CREATED_TEXT = 'Черновик создан';
const DRAFT_TOO_LONG_TEXT = `Текст длиннее ${POST_BODY_MAX} символов, черновик не создан.`;
const DRAFT_INVALID_TEXT = 'Текст содержит недопустимые символы, черновик не создан.';

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
  bot.use(ownerOnly(config.ownerId));
  bot.use(privateChatOnly());
  // After the owner check, so a stranger's update is never stored. A replay ends here without a reply.
  bot.use(async (ctx, next) => {
    if (await runtime.updates.claim(ctx.update.update_id, runtime.clock.now())) await next();
  });
  bot.command('start', async (ctx) => {
    await ctx.reply('Студия на связи. Откройте её кнопкой ниже.', {
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
        .then(() =>
          configureOwnerChat(
            { api: runtime.adminApi, call: runtime.call },
            { ownerId: config.ownerId, appOrigin: runtime.appOrigin }
          )
        )
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
    'today',
    report(() => runtime.reports.today())
  );
  bot.command(
    'next',
    report(() => runtime.reports.next())
  );
  bot.command(
    'status',
    report(() => runtime.reports.status())
  );

  // Whatever the owner sends or forwards becomes a draft. An unknown command is not a post.
  bot.on('message:text', async (ctx) => {
    if (ctx.message.entities?.some((entity) => entity.type === 'bot_command' && entity.offset === 0)) return;
    const draft = draftFromMessageText(ctx.message.text);
    if (!draft.ok) {
      await ctx.reply(draft.reason === 'TOO_LONG' ? DRAFT_TOO_LONG_TEXT : DRAFT_INVALID_TEXT);
      return;
    }
    let post: { id: string };
    try {
      // The update id as the key: a replay that slipped past the dedup still cannot create a second draft.
      post = await runtime.createDraft(draft.input, `tg-update-${ctx.update.update_id}`);
    } catch (error) {
      runtime.onError(error);
      await ctx.reply(DRAFT_FAILED_TEXT);
      return;
    }
    await ctx.reply(DRAFT_CREATED_TEXT, {
      reply_markup: new InlineKeyboard().webApp(OPEN_BUTTON_TEXT, `${runtime.appOrigin}/posts/${post.id}`)
    });
  });
  return bot;
}
