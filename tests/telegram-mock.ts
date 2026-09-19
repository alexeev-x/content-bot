import { vi } from 'vitest';

/**
 * Перехватываем ЛЮБОЙ вызов к Telegram, независимо от токена: тестовый прогон подхватывает
 * настоящий .dev.vars, и привязка к фиктивному токену означала бы, что с реальным токеном
 * запрос молча ушёл бы наружу.
 */
const API = 'https://api.telegram.org/';

type Call = Record<string, unknown>;
type Envelope =
  | { ok: true; result: unknown }
  | { ok: false; error_code: number; description?: string; parameters?: { retry_after: number } };
type Handler = (payload: Call, index: number) => Envelope | Promise<Envelope>;

const handlers = new Map<string, Handler>();
const calls = new Map<string, Call[]>();

/**
 * Перехватываем исходящие вызовы на уровне глобального fetch: наш HTTP-клиент ходит через него,
 * поэтому подмена покрывает и код, вызванный через SELF.fetch, и прямые вызовы сервисов.
 * Всё, что не Telegram, роняем — тест не должен ходить в сеть незаметно.
 */
export const installTelegramMock = () => {
  handlers.clear();
  calls.clear();

  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

    if (!url.startsWith(API)) throw new Error(`Неожиданный исходящий запрос: ${url}`);

    // https://api.telegram.org/bot<token>/<method>
    const method = url.slice(API.length).split('/').slice(1).join('/');
    const payload = JSON.parse(String(init?.body ?? '{}')) as Call;
    const recorded = calls.get(method) ?? [];
    recorded.push(payload);
    calls.set(method, recorded);

    const handler = handlers.get(method);
    const body = handler
      ? await handler(payload, recorded.length)
      : { ok: true, result: { message_id: recorded.length } };

    return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
  });
};

export const onTelegram = (method: string, handler: Handler) => handlers.set(method, handler);

export const telegramCalls = (method: string): Call[] => calls.get(method) ?? [];

/** Разделы создаются пачкой — отдаём каждой теме свой thread_id. */
export const topicsRespond = () =>
  onTelegram('createForumTopic', (_payload, index) => ({
    ok: true,
    result: { message_thread_id: 1000 + index, name: 'topic' },
  }));

const SECRET = '0123456789abcdef0123456789abcdef0123456789';

/** `null` — заголовка нет. Именно null, а не undefined: явный undefined подставит значение по умолчанию. */
export const webhookRequest = (update: unknown, secret: string | null = SECRET) =>
  new Request('https://bot.test/telegram/webhook', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(secret === null ? {} : { 'X-Telegram-Bot-Api-Secret-Token': secret }),
    },
    body: JSON.stringify(update),
  });

export const ownerMessage = (updateId: number, text: string, threadId?: number) => ({
  update_id: updateId,
  message: {
    message_id: updateId,
    date: 1,
    chat: { id: 100, type: 'private' },
    from: { id: 100, is_bot: false, first_name: 'Owner' },
    ...(threadId === undefined ? {} : { message_thread_id: threadId, is_topic_message: true }),
    text,
    ...(text.startsWith('/') ? { entities: [{ offset: 0, length: text.length, type: 'bot_command' }] } : {}),
  },
});
