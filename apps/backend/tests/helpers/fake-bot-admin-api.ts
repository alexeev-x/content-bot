import type { TelegramBotAdminApi } from '../../src/integrations/telegram/telegram-api';

export interface FakeBotAdminApi extends TelegramBotAdminApi {
  /** One line per call, in order, with the arguments that matter. */
  calls: string[];
  /** Everything handed to Telegram, to prove a secret never leaves in an unexpected place. */
  sent: unknown[];
}

export type Failures = Partial<Record<keyof TelegramBotAdminApi, () => never>>;

export function fakeBotAdminApi(script: { webhookInfo?: unknown; failures?: Failures } = {}): FakeBotAdminApi {
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
    getWebhookInfo: () =>
      run('getWebhookInfo', 'getWebhookInfo', null, script.webhookInfo ?? { url: '', pending_update_count: 0 }),
    setWebhook: (input) => run('setWebhook', `setWebhook ${input.url}`, input),
    deleteMyCommands: (input) =>
      run('deleteMyCommands', `deleteMyCommands ${input.scope ?? 'default'} ${input.languageCode ?? '-'}`, input),
    setChatCommands: (chatId, commands) =>
      run('setChatCommands', `setChatCommands ${chatId} ${commands.map((c) => c.command).join(',')}`, commands),
    setChatMenuWebApp: (chatId, input) =>
      run('setChatMenuWebApp', `setChatMenuWebApp ${chatId} ${input.text} ${input.url}`, input)
  };
}
