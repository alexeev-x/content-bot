import type { TelegramBotAdminApi } from '../../src/integrations/telegram/telegram-api';

export interface FakeBotAdminApi extends TelegramBotAdminApi {
  /** One line per call, in order, with the arguments that matter. */
  calls: string[];
  /** Everything handed to Telegram, to prove a secret never leaves in an unexpected place. */
  sent: unknown[];
}

export type Failures = Partial<Record<keyof TelegramBotAdminApi, () => never>>;

// What Telegram answers for the test bot: its id is the one in the harness token (`123456:...`).
export const FAKE_BOT_ME = {
  id: 123456,
  is_bot: true,
  first_name: 'Bot',
  username: 'content_bot',
  can_join_groups: true,
  can_read_all_group_messages: false,
  supports_inline_queries: false
};

export function fakeBotAdminApi(
  script: { me?: unknown; webhookInfo?: unknown; failures?: Failures } = {}
): FakeBotAdminApi {
  const calls: string[] = [];
  const sent: unknown[] = [];
  const run = (name: keyof TelegramBotAdminApi, line: string, payload: unknown, answer: unknown = true) => {
    calls.push(line);
    sent.push(payload);
    try {
      script.failures?.[name]?.();
    } catch (error) {
      return Promise.reject(error);
    }
    return Promise.resolve(answer);
  };
  return {
    calls,
    sent,
    getMe: () => run('getMe', 'getMe', null, script.me ?? FAKE_BOT_ME),
    getWebhookInfo: () =>
      run('getWebhookInfo', 'getWebhookInfo', null, script.webhookInfo ?? { url: '', pending_update_count: 0 }),
    setWebhook: (input) => run('setWebhook', `setWebhook ${input.url}`, input),
    deleteMyCommands: (input) =>
      run(
        'deleteMyCommands',
        `deleteMyCommands ${typeof input.scope === 'object' ? `chat ${input.scope.chatId}` : (input.scope ?? 'default')} ${input.languageCode ?? '-'}`,
        input
      ),
    setChatCommands: (chatId, commands) =>
      run('setChatCommands', `setChatCommands ${chatId} ${commands.map((c) => c.command).join(',')}`, commands),
    setChatMenuCommands: (chatId) => run('setChatMenuCommands', `setChatMenuCommands ${chatId}`, chatId)
  };
}
