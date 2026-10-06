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
  const lastErrorAt =
    info.last_error_date === undefined || info.last_error_date === 0
      ? null
      : new Date(info.last_error_date * 1000).toISOString();
  return {
    missing: [],
    botUsername: setup.botUsername,
    expectedUrl,
    webhook: {
      url: info.url === '' ? null : info.url,
      pointsHere: info.url === expectedUrl,
      pendingUpdateCount: info.pending_update_count,
      lastErrorAt,
      lastErrorMessage: info.last_error_message?.slice(0, MAX_ERROR_MESSAGE) ?? null
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
  // Lists left by an older bot take precedence over the one set for the owner's chat below.
  await call.act('bot_connect.delete_default_commands', (signal) => api.deleteMyCommands({}, signal));
  await call.act('bot_connect.delete_private_chat_commands', (signal) =>
    api.deleteMyCommands({ scope: 'all_private_chats' }, signal)
  );
  await call.act('bot_connect.delete_ru_commands', (signal) => api.deleteMyCommands({ languageCode: 'ru' }, signal));
  await configureOwnerChat({ api, call }, { ownerId: config.ownerId, appOrigin });
  return getBotStatus(deps);
}
