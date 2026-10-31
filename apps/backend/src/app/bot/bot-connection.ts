import type { BotAudienceDto, BotStatusDto } from '@alexeev/contracts';
import {
  type AudienceRepository,
  type AudienceTargets,
  type AudienceTelegram,
  checkAudienceSetup,
  readAudienceStatus
} from '../../modules/audience';
import { z } from 'zod';
import type { Clock } from '../../platform/clock';
import type { Logger } from '../../platform/logging/logger';
import type { TelegramBotAdminApi, TelegramUpdateKind } from '../../integrations/telegram/telegram-api';
import { AppError } from '../../shared/app-error';
import type { AppEnv } from '../env';
import type { SystemStateStore } from '../system-state';
import { webhookUrlFor } from './app-origin';
import { botInfoSchema } from './bot-info';
import type { BotIdentityStore } from './bot-identity-store';
import { type BotSetup, inspectBotSetup, loadBotSetup } from './create-bot';
import { configureOwnerChat } from './owner-chat';
import type { TelegramCaller } from './telegram-call';

const MAX_ERROR_MESSAGE = 500;
const REDACTED = '***';
// Telegram's own URL shape for a token: /bot<id>:<secret>. Catches a token this Worker no longer holds.
const TOKEN_IN_PATH = /bot\d+(?::|%3A)[\w%-]+/gi;

// A webhook URL registered by an older setup can carry the token in its path, and the status is
// shown to the owner, so the token never leaves in it.
function redactToken(text: string, token: string): string {
  let result = text;
  for (const form of new Set([token, encodeURIComponent(token)])) {
    if (form !== '') result = result.split(form).join(REDACTED);
  }
  return result.replace(TOKEN_IN_PATH, `bot${REDACTED}`);
}

const webhookInfoSchema = z.object({
  url: z.string(),
  pending_update_count: z.number().int().nonnegative(),
  last_error_date: z.number().int().nonnegative().optional(),
  last_error_message: z.string().optional(),
  allowed_updates: z.array(z.string()).optional()
});

/** The update kinds the bot asks for: the owner's messages and buttons, the channel's polls and reactions. */
const ALLOWED_UPDATES: TelegramUpdateKind[] = ['message', 'callback_query', 'poll', 'message_reaction_count'];

export interface BotConnectionDeps {
  env: AppEnv;
  /** This Worker's public origin (see `appOriginOf`). */
  appOrigin: string;
  /** Resolved only once the settings are complete, so a Worker without a token never builds it. */
  api: () => TelegramBotAdminApi;
  call: TelegramCaller;
  /** Where connect stores the bot identity that Telegram answers with. */
  identity: BotIdentityStore;
  /** Connect also keeps this Worker's origin, which Cron's owner alerts need for their buttons. */
  appState: Pick<SystemStateStore, 'rememberAppOrigin'>;
  clock: Clock;
  logger: Logger;
  requestId?: string;
  /** The channel's audience (migration 0118); absent in setups that do not listen to it. */
  audience?: {
    repo: AudienceRepository;
    targets: AudienceTargets;
    telegram: () => AudienceTelegram;
    hasKey: boolean;
  };
}

// Reads Telegram's webhook info; changes nothing. Without the complete settings Telegram is not asked.
// The bot identity is not needed to read it, so a bot that was never connected still shows its webhook.
export async function getBotStatus(deps: BotConnectionDeps): Promise<BotStatusDto> {
  return statusOf(deps, await loadBotSetup(deps.env, deps.identity, deps));
}

async function statusOf(deps: BotConnectionDeps, setup: BotSetup): Promise<BotStatusDto> {
  const { appOrigin, call } = deps;
  const expectedUrl = webhookUrlFor(appOrigin);
  const { settings } = setup;
  if (settings === null) {
    return { missing: setup.missing, botUsername: setup.botUsername, expectedUrl, webhook: null };
  }
  const audience = await audienceOf(deps);

  const api = deps.api();
  const info = await call.read(
    'bot_status.get_webhook_info',
    (signal) => api.getWebhookInfo(signal),
    webhookInfoSchema
  );
  const shownUrl = redactToken(info.url, settings.token);
  const lastErrorAt =
    info.last_error_date === undefined || info.last_error_date === 0
      ? null
      : new Date(info.last_error_date * 1000).toISOString();
  return {
    missing: [],
    botUsername: setup.botUsername,
    expectedUrl,
    webhook: {
      url: shownUrl === '' ? null : shownUrl,
      pointsHere: info.url === expectedUrl,
      pendingUpdateCount: info.pending_update_count,
      lastErrorAt,
      lastErrorMessage: info.last_error_message
        ? redactToken(info.last_error_message, settings.token).slice(0, MAX_ERROR_MESSAGE)
        : null,
      allowedUpdates: info.allowed_updates ?? null
    },
    ...(audience === null ? {} : { audience })
  };
}

// Before migration 0118 the tables are not there: the status then simply leaves the audience out.
async function audienceOf(deps: BotConnectionDeps): Promise<BotAudienceDto | null> {
  if (deps.audience === undefined) return null;
  try {
    const status = await readAudienceStatus({
      repo: deps.audience.repo,
      now: deps.clock.now(),
      hasKey: deps.audience.hasKey
    });
    return {
      ...status,
      lastUpdateAt: status.lastUpdateAt === null ? null : new Date(status.lastUpdateAt).toISOString(),
      checkedAt: status.checkedAt === null ? null : new Date(status.checkedAt).toISOString()
    };
  } catch {
    return null;
  }
}

// Asks Telegram who the bot is and stores the answer, registers this Worker's own webhook and the
// owner's chat setup, then reports the fresh status. Sequential on purpose: if a step fails the earlier
// ones stay set, and pressing the button again repeats them all with the same values. `getMe` comes
// first and its failure stores nothing, so the webhook is never registered for an unknown bot.
export async function connectBot(deps: BotConnectionDeps): Promise<BotStatusDto> {
  const { env, appOrigin, call } = deps;
  const { settings } = await loadBotSetup(env, deps.identity, deps);
  if (settings === null) {
    throw new AppError('UNAVAILABLE', 'Telegram bot is not configured', { reason: 'BOT_NOT_CONFIGURED' });
  }

  const api = deps.api();
  const me = await call.read('bot_connect.get_me', (signal) => api.getMe(signal), botInfoSchema);
  await deps.identity.save(me, deps.clock.now());
  await call.act('bot_connect.set_webhook', (signal) =>
    api.setWebhook(
      {
        url: webhookUrlFor(appOrigin),
        secretToken: settings.webhookSecret,
        allowedUpdates: ALLOWED_UPDATES
      },
      signal
    )
  );
  // Telegram keeps one command list per (scope, language) and, in a private chat, shows the most
  // specific one: chat+language, chat, all_private_chats+language, all_private_chats, default+language,
  // default ("Determining list of commands" in the Bot API). The owner's own list (set below, in the
  // chat scope) therefore wins over every broader list; only the chat+language one, which an older
  // bot may have left, would still shadow it, so it is deleted too. The broader lists are cleared so
  // no other chat or language shows stale commands. Ten Telegram requests in all (with `getMe` and the
  // status read), the most a single connect may use.
  const stale = [
    { label: 'default_commands', input: {} },
    { label: 'private_chat_commands', input: { scope: 'all_private_chats' as const } },
    { label: 'ru_commands', input: { languageCode: 'ru' as const } },
    { label: 'private_chat_ru_commands', input: { scope: 'all_private_chats' as const, languageCode: 'ru' as const } },
    {
      label: 'owner_chat_ru_commands',
      input: { scope: { chatId: settings.ownerId }, languageCode: 'ru' as const }
    }
  ];
  for (const { label, input } of stale) {
    await call.act(`bot_connect.delete_${label}`, (signal) => api.deleteMyCommands(input, signal));
  }
  await configureOwnerChat({ api, call }, { ownerId: settings.ownerId });
  // Everything Telegram needed is already set, so a store that cannot take the origin (a deployment
  // before migration 0009) does not turn the connect into a failure; /start stores it again.
  try {
    await deps.appState.rememberAppOrigin(appOrigin, deps.clock.now());
  } catch {
    deps.logger.warn({
      component: 'bot',
      operation: 'bot_connect.remember_origin',
      ...(deps.requestId === undefined ? {} : { requestId: deps.requestId }),
      errorCode: 'APP_ORIGIN_NOT_STORED'
    });
  }
  // Best effort: which channels and groups the bot can hear. A failure never fails the connect; the daily health step
  // checks again.
  if (deps.audience !== undefined) {
    try {
      await checkAudienceSetup({
        repo: deps.audience.repo,
        targets: deps.audience.targets,
        telegram: deps.audience.telegram(),
        bot: { id: me.id, readsAllGroupMessages: me.can_read_all_group_messages },
        now: deps.clock.now()
      });
    } catch {
      deps.logger.warn({
        component: 'bot',
        operation: 'bot_connect.audience_setup',
        ...(deps.requestId === undefined ? {} : { requestId: deps.requestId }),
        errorCode: 'AUDIENCE_SETUP_CHECK_FAILED'
      });
    }
  }
  return statusOf(deps, inspectBotSetup(env, me));
}
