import { GrammyError, HttpError } from 'grammy';
import { z } from 'zod';
import type { Logger } from '../../../platform/logging/logger';
import { AppError } from '../../../shared/app-error';
import type { ChatInspector } from '../application/ports';
import { assessBotPosting } from '../domain/bot-posting-rights';

export const CHAT_CHECK_TIMEOUT_MS = 8_000;

// What the adapter needs from Telegram: `integrations/telegram` provides it, tests script it.
export interface TelegramChatReader {
  getChat(chatId: string, signal: AbortSignal): Promise<unknown>;
  getMe(signal: AbortSignal): Promise<unknown>;
  getChatMember(chatId: string, userId: number, signal: AbortSignal): Promise<unknown>;
}

const chatSchema = z.object({
  id: z.number().int(),
  type: z.string(),
  title: z.string().min(1).optional(),
  username: z.string().min(1).optional(),
  permissions: z.object({ can_send_messages: z.boolean().optional() }).optional()
});
const botSchema = z.object({ id: z.number().int().positive() });
const memberSchema = z.object({
  status: z.enum(['creator', 'administrator', 'member', 'restricted', 'left', 'kicked']),
  can_post_messages: z.boolean().optional(),
  can_send_messages: z.boolean().optional(),
  is_member: z.boolean().optional()
});

const CHAT_NOT_FOUND = /chat not found|PEER_ID_INVALID/i;
// A public channel answers getChat to anyone, but refuses getChatMember to a bot that is not its administrator.
const MEMBER_LIST_INACCESSIBLE = /member list is inaccessible/i;
// Telegram caps retry_after far above what a person should wait for a form; the header stays sane.
const MAX_RETRY_AFTER_SEC = 3_600;

const unavailable = () => new AppError('UNAVAILABLE', 'Telegram is unavailable, try again');
const chatNotFound = () =>
  new AppError('NOT_FOUND', 'Telegram does not know this chat or the bot cannot see it', { reason: 'CHAT_NOT_FOUND' });

// Every outcome is classified, none is retried: these are reads, so the owner simply presses the
// button again. A Telegram failure that says nothing about the chat (bad token, 5xx, network,
// timeout, a changed response shape) is 503, never 401, which the client reads as "sign in again".
// `failure` is only a stable code for the log; the Telegram message is never logged (it can echo the token path).
function classify(error: unknown, signal: AbortSignal): { error: AppError; failure: string } {
  if (error instanceof AppError) return { error, failure: error.code };
  if (signal.aborted) return { error: unavailable(), failure: 'timeout' };
  if (error instanceof GrammyError) {
    const code = error.error_code;
    if (code === 429) {
      const wait = error.parameters.retry_after;
      const retryAfterSec = Math.min(MAX_RETRY_AFTER_SEC, Math.max(1, typeof wait === 'number' ? Math.ceil(wait) : 1));
      return {
        error: new AppError('RATE_LIMIT', 'Telegram asks to slow down', undefined, retryAfterSec),
        failure: 'telegram_http_429'
      };
    }
    if (code === 403 || (code === 400 && CHAT_NOT_FOUND.test(error.description))) {
      return { error: chatNotFound(), failure: `telegram_http_${code}` };
    }
    return { error: unavailable(), failure: `telegram_http_${code}` };
  }
  if (error instanceof HttpError) return { error: unavailable(), failure: 'network_error' };
  return { error: unavailable(), failure: 'unexpected_error' };
}

function parseOrUnavailable<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new AppError('UNAVAILABLE', 'Telegram answered in an unexpected shape');
  return parsed.data;
}

// At most three subrequests (two when the bot id is configured), each with its own timeout.
export function createTelegramChatInspector(deps: {
  reader: TelegramChatReader;
  /** The bot's own id when known (BOT_INFO); otherwise `getMe` is asked. */
  botId: number | null;
  logger: Logger;
  timeoutMs?: number;
}): ChatInspector {
  const { reader, logger, timeoutMs = CHAT_CHECK_TIMEOUT_MS } = deps;

  // One call with its own deadline; the signal travels to the classifier to tell a timeout from a network error.
  async function call<T>(operation: string, run: (signal: AbortSignal) => Promise<unknown>, schema: z.ZodType<T>) {
    const signal = AbortSignal.timeout(timeoutMs);
    try {
      return parseOrUnavailable(schema, await run(signal));
    } catch (error) {
      const { error: mapped, failure } = classify(error, signal);
      logger.warn({ component: 'telegram', operation, status: mapped.status, errorCode: failure });
      throw mapped;
    }
  }

  return {
    async inspect(chatId) {
      const chat = await call('check_destination.get_chat', (signal) => reader.getChat(chatId, signal), chatSchema);
      const kind =
        chat.type === 'channel' ? 'channel' : chat.type === 'group' || chat.type === 'supergroup' ? 'group' : null;
      if (kind === null) {
        throw new AppError('VALIDATION_ERROR', 'Only a channel or a group can be a destination', {
          reason: 'NOT_A_CHANNEL_OR_GROUP'
        });
      }
      if (chat.title === undefined) throw new AppError('UNAVAILABLE', 'Telegram answered in an unexpected shape');
      const canonicalId = String(chat.id);
      const botId =
        deps.botId ?? (await call('check_destination.get_me', (signal) => reader.getMe(signal), botSchema)).id;
      const member = await call(
        'check_destination.get_chat_member',
        async (signal) => {
          try {
            return await reader.getChatMember(canonicalId, botId, signal);
          } catch (error) {
            // A bot cannot join a channel as a plain subscriber, so "not an administrator" means "not there".
            if (
              error instanceof GrammyError &&
              error.error_code === 400 &&
              MEMBER_LIST_INACCESSIBLE.test(error.description)
            ) {
              return { status: 'left' };
            }
            throw error;
          }
        },
        memberSchema
      );

      const problem = assessBotPosting({
        kind,
        membership: {
          status: member.status,
          canPostMessages: member.can_post_messages,
          canSendMessages: member.can_send_messages,
          isMember: member.is_member
        },
        // Absent permissions are not "muted": only an explicit false blocks ordinary members.
        membersMaySend: chat.permissions?.can_send_messages !== false
      });
      return {
        chatId: canonicalId,
        username: chat.username ?? null,
        title: chat.title,
        kind,
        botCanPost: problem === null,
        problem
      };
    }
  };
}
