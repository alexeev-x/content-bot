import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { createTelegramApi } from 'src/core/telegram';
import { onTelegram, telegramCalls } from './telegram-mock';

const api = () => createTelegramApi('1:test', { d1: env.DB, scope: 'test' });
const message = { chatId: 100, text: 'hello', operationKey: 'reply' };

describe('журнал Telegram', () => {
  it('возвращает сохранённый успех после рестарта клиента', async () => {
    await api().sendMessage(message);
    await api().sendMessage(message);
    expect(telegramCalls('sendMessage')).toHaveLength(1);
  });
  it('отклоняет повтор ключа с другим содержимым', async () => {
    await api().sendMessage(message);
    await expect(api().sendMessage({ ...message, text: 'changed' })).rejects.toMatchObject({ code: 'internal' });
    expect(telegramCalls('sendMessage')).toHaveLength(1);
  });
  it('после жёсткого сбоя не отправляет действие без подтверждённого исхода', async () => {
    await env.DB.prepare(
      "INSERT INTO telegram_operations (key, method, payload, state, updated_at) VALUES (?,?,?,'sending',0)",
    )
      .bind('reply', 'sendMessage', JSON.stringify({ chat_id: 100, text: 'hello' }))
      .run();
    await expect(api().sendMessage(message)).rejects.toMatchObject({ code: 'outcome_unknown' });
    expect(telegramCalls('sendMessage')).toHaveLength(0);
  });
  it('соблюдает Telegram retry_after и не раскрывает description', async () => {
    onTelegram('sendMessage', () => ({
      ok: false,
      error_code: 429,
      description: 'SECRET',
      parameters: { retry_after: 60 },
    }));
    await expect(api().sendMessage(message)).rejects.toMatchObject({
      code: 'upstream_failed',
      retryable: true,
      retryAfterMs: 60_000,
      message: 'Telegram rejected the operation',
    });
    await expect(api().sendMessage(message)).rejects.toMatchObject({ code: 'operation_busy' });
    expect(telegramCalls('sendMessage')).toHaveLength(1);
  });
  it('некорректный ответ считается неопределённым, не поводом повторить создание', async () => {
    onTelegram('createForumTopic', () => ({ ok: true, result: null }));
    const topic = { chatId: 100, name: 'test', operationKey: 'topic' };
    await expect(api().createTopic(topic)).rejects.toMatchObject({ code: 'outcome_unknown' });
    await expect(api().createTopic(topic)).rejects.toMatchObject({ code: 'outcome_unknown' });
    expect(telegramCalls('createForumTopic')).toHaveLength(1);
  });
});
