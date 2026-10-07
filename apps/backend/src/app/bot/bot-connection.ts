import type { BotStatusDto } from '@alexeev/contracts';
import { z } from 'zod';
import type { TelegramBotAdminApi } from '../../integrations/telegram/telegram-api';
import { AppError } from '../../shared/app-error';
import type { AppEnv } from '../env';
import { webhookUrlFor } from './app-origin';
import { inspectBotSetup } from './create-bot';
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
  last_error_message: z.string().optional()
});

export interface BotConnectionDeps {
  env: AppEnv;
  /** This Worker's public origin (see `appOriginOf`). */
  appOrigin: string;
  /** Resolved only once the settings are complete, so a Worker without a token never builds it. */
  api: () => TelegramBotAdminApi;
  call: TelegramCaller;
}

// Reads Telegram's webhook info; changes nothing. Without complete settings Telegram is not asked.
export async function getBotStatus(deps: BotConnectionDeps): Promise<BotStatusDto> {
  const { env, appOrigin, call } = deps;
  const setup = inspectBotSetup(env);
  const expectedUrl = webhookUrlFor(appOrigin);
  if (setup.config === null) {
    return { missing: setup.missing, botUsername: setup.botUsername, expectedUrl, webhook: null };
  }

  const api = deps.api();
  const info = await call.read(
    'bot_status.get_webhook_info',
    (signal) => api.getWebhookInfo(signal),
    webhookInfoSchema
  );
  const shownUrl = redactToken(info.url, setup.config.token);
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
        ? redactToken(info.last_error_message, setup.config.token).slice(0, MAX_ERROR_MESSAGE)
        : null
    }
  };
}

// Registers this Worker's own webhook and the owner's chat setup, then reports the fresh status.
// Sequential on purpose: if a step fails the earlier ones stay set, and pressing the button again
// repeats them all with the same values.
export async function connectBot(deps: BotConnectionDeps): Promise<BotStatusDto> {
  const { env, appOrigin, call } = deps;
  const { config } = inspectBotSetup(env);
  if (config === null) {
    throw new AppError('UNAVAILABLE', 'Telegram bot is not configured', { reason: 'BOT_NOT_CONFIGURED' });
  }

  const api = deps.api();
  await call.act('bot_connect.set_webhook', (signal) =>
    api.setWebhook(
      {
        url: webhookUrlFor(appOrigin),
        secretToken: config.webhookSecret,
        allowedUpdates: ['message', 'callback_query']
      },
      signal
    )
  );
  // Telegram keeps one command list per (scope, language) and, in a private chat, shows the most
  // specific one: chat+language, chat, all_private_chats+language, all_private_chats, default+language,
  // default ("Determining list of commands" in the Bot API). The owner's own list (set below, in the
  // chat scope) therefore wins over every broader list; only the chat+language one, which an older
  // bot may have left, would still shadow it, so it is deleted too. The broader lists are cleared so
  // no other chat or language shows stale commands. Nine Telegram requests in all, under the limit of ten.
  const stale = [
    { label: 'default_commands', input: {} },
    { label: 'private_chat_commands', input: { scope: 'all_private_chats' as const } },
    { label: 'ru_commands', input: { languageCode: 'ru' as const } },
    { label: 'private_chat_ru_commands', input: { scope: 'all_private_chats' as const, languageCode: 'ru' as const } },
    {
      label: 'owner_chat_ru_commands',
      input: { scope: { chatId: config.ownerId }, languageCode: 'ru' as const }
    }
  ];
  for (const { label, input } of stale) {
    await call.act(`bot_connect.delete_${label}`, (signal) => api.deleteMyCommands(input, signal));
  }
  await configureOwnerChat({ api, call }, { ownerId: config.ownerId, appOrigin });
  return getBotStatus(deps);
}
