import { GrammyError } from 'grammy';
import { z } from 'zod';
import type { TelegramInviteLinkApi } from '../integrations/telegram/telegram-api';
import type { InviteLinkTelegram } from '../modules/content-analytics';
import type { Logger } from '../platform/logging/logger';
import { createTelegramCaller } from './bot/telegram-call';

// 400 (no right to invite, chat not found) and 403 (the bot is not in the channel) are the owner's to fix in
// Telegram, so they come back as a refusal instead of «Telegram is unavailable». Everything else (timeouts,
// 5xx, 429) goes through the caller, which logs it and throws the AppError.
const REFUSED = { refused: true } as const;
const refusedSchema = z.object({ refused: z.literal(true) });
const createdSchema = z.union([z.object({ invite_link: z.url() }), refusedSchema]);
const revokedSchema = z.union([refusedSchema, z.unknown()]);

const refusalOf = (error: unknown) =>
  error instanceof GrammyError && (error.error_code === 400 || error.error_code === 403);

async function orRefused(run: () => Promise<unknown>): Promise<unknown> {
  try {
    return await run();
  } catch (error) {
    if (refusalOf(error)) return REFUSED;
    throw error;
  }
}

const isRefused = (answer: unknown) => refusedSchema.safeParse(answer).success;

/** The module's view of the invite link calls. */
export function createInviteLinkTelegram(
  api: TelegramInviteLinkApi,
  deps: { logger: Logger; requestId?: string }
): InviteLinkTelegram {
  const call = createTelegramCaller(deps);
  const logRefusal = (operation: string) =>
    deps.logger.warn({
      component: 'telegram',
      operation,
      ...(deps.requestId === undefined ? {} : { requestId: deps.requestId }),
      errorCode: 'invite_refused'
    });

  return {
    async create(channel, name) {
      const answer = await call.read(
        'invite_link.create',
        (signal) => orRefused(() => api.createChatInviteLink(channel, name, signal)),
        createdSchema
      );
      if ('invite_link' in answer) return { ok: true, value: answer.invite_link };
      logRefusal('invite_link.create');
      return { ok: false, reason: 'forbidden' };
    },
    async revoke(channel, url) {
      const answer = await call.read(
        'invite_link.revoke',
        (signal) => orRefused(() => api.revokeChatInviteLink(channel, url, signal)),
        revokedSchema
      );
      if (!isRefused(answer)) return { ok: true, value: undefined };
      logRefusal('invite_link.revoke');
      return { ok: false, reason: 'forbidden' };
    }
  };
}
