import { describe, expect, it } from 'vitest';
import { apiError, BOT_ID, channelChat, fakeChatApi, networkError } from '../../../../tests/helpers/fake-chat-api';
import { createLogger } from '../../../platform/logging/logger';
import { AppError } from '../../../shared/app-error';
import { createTelegramChatInspector, type TelegramChatReader } from './telegram-chat-inspector';

function logsOf(): { lines: string[]; logger: ReturnType<typeof createLogger> } {
  const lines: string[] = [];
  return { lines, logger: createLogger((line) => lines.push(line)) };
}

const silent = () => logsOf().logger;

async function failureOf(promise: Promise<unknown>): Promise<AppError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof AppError) return error;
    throw error;
  }
  throw new Error('expected the inspection to fail');
}

const failWith429 = (retry: number) =>
  failureOf(
    createTelegramChatInspector({
      reader: fakeChatApi({
        chat: () => {
          throw apiError(429, 'Too Many Requests', { retry_after: retry });
        }
      }),
      botId: 1,
      logger: silent()
    }).inspect('-100')
  );

describe('createTelegramChatInspector', () => {
  it('gives every Telegram call its own signal that aborts at the timeout', async () => {
    const signals: AbortSignal[] = [];
    const reader: TelegramChatReader = {
      getChat: (_id, signal) => {
        signals.push(signal);
        return Promise.resolve(channelChat());
      },
      getMe: (signal) => {
        signals.push(signal);
        return Promise.resolve({ id: BOT_ID });
      },
      getChatMember: (_id, _user, signal) => {
        signals.push(signal);
        return Promise.resolve({ status: 'creator' });
      }
    };

    await createTelegramChatInspector({ reader, botId: null, logger: silent() }).inspect('@dev_news');

    expect(signals).toHaveLength(3);
    expect(new Set(signals).size).toBe(3);
    expect(signals.every((signal) => !signal.aborted)).toBe(true);
  });

  it('turns a request that outlives its deadline into UNAVAILABLE and logs only a stable code', async () => {
    const { lines, logger } = logsOf();
    const reader: TelegramChatReader = {
      getChat: (_id, signal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(networkError()));
        }),
      getMe: () => Promise.reject(new Error('not reached')),
      getChatMember: () => Promise.reject(new Error('not reached'))
    };

    const error = await failureOf(
      createTelegramChatInspector({ reader, botId: null, logger, timeoutMs: 20 }).inspect('-100')
    );

    expect(error).toMatchObject({ code: 'UNAVAILABLE', status: 503 });
    expect(JSON.parse(lines[0] ?? '')).toMatchObject({
      level: 'warn',
      component: 'telegram',
      operation: 'check_destination.get_chat',
      errorCode: 'timeout'
    });
  });

  it('never writes the Telegram description, the chat id or the token to the log', async () => {
    const { lines, logger } = logsOf();
    const description = 'Bad Request: chat not found for bot123456:SECRET-TOKEN';
    const api = fakeChatApi({
      chat: () => {
        throw apiError(400, description);
      }
    });

    await failureOf(createTelegramChatInspector({ reader: api, botId: 1, logger }).inspect('@private_chat_name'));

    const log = lines.join('\n');
    expect(log).not.toContain('SECRET-TOKEN');
    expect(log).not.toContain('private_chat_name');
    expect(log).not.toContain('chat not found');
    expect(JSON.parse(log)).toMatchObject({ errorCode: 'telegram_http_400', status: 404 });
  });

  it('clamps retry_after to at least one second and at most an hour', async () => {
    expect((await failWith429(0)).retryAfterSec).toBe(1);
    expect((await failWith429(999_999)).retryAfterSec).toBe(3_600);
  });

  it('is a plain 429 with a one second wait when Telegram sends no retry_after', async () => {
    const error = await failureOf(
      createTelegramChatInspector({
        reader: fakeChatApi({
          chat: () => {
            throw apiError(429, 'Too Many Requests');
          }
        }),
        botId: 1,
        logger: silent()
      }).inspect('-100')
    );

    expect(error).toMatchObject({ code: 'RATE_LIMIT', retryAfterSec: 1 });
  });

  it('stops after getChat when it fails: no later subrequest is made', async () => {
    const api = fakeChatApi({
      chat: () => {
        throw networkError();
      }
    });

    await failureOf(createTelegramChatInspector({ reader: api, botId: null, logger: silent() }).inspect('-100'));

    expect(api.calls).toHaveLength(1);
  });

  it('reads "member list is inaccessible" for a public channel as the bot not being there, not as UNAVAILABLE', async () => {
    const api = fakeChatApi({
      chat: channelChat(),
      member: () => {
        throw apiError(400, 'Bad Request: member list is inaccessible');
      }
    });

    const result = await createTelegramChatInspector({ reader: api, botId: 42, logger: silent() }).inspect('@dev_news');

    expect(result).toMatchObject({ kind: 'channel', botCanPost: false, problem: 'BOT_NOT_MEMBER' });
  });

  it('keeps any other getChatMember 400 as UNAVAILABLE', async () => {
    const api = fakeChatApi({
      chat: channelChat(),
      member: () => {
        throw apiError(400, 'Bad Request: something else');
      }
    });

    const error = await failureOf(
      createTelegramChatInspector({ reader: api, botId: 42, logger: silent() }).inspect('@dev_news')
    );

    expect(error).toMatchObject({ code: 'UNAVAILABLE', status: 503 });
  });

  it('asks getChatMember with the canonical id from getChat, not the typed @username', async () => {
    const api = fakeChatApi({ chat: channelChat({ id: -1005550001 }) });

    await createTelegramChatInspector({ reader: api, botId: 42, logger: silent() }).inspect('@dev_news');

    expect(api.calls).toEqual(['getChat @dev_news', 'getChatMember -1005550001 42']);
  });
});
