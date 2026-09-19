import { env, SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { onTelegram, ownerMessage, topicsRespond, webhookRequest } from './telegram-mock';

describe('сбой обработки', () => {
  /**
   * Самый дорогой сценарий: отметка дедупа стоит ДО работы. Если при сбое её не снять,
   * повторная доставка Telegram будет отброшена, и сообщение исчезнет навсегда.
   */
  it('снимает отметку апдейта, чтобы повтор сработал', async () => {
    topicsRespond();
    onTelegram('sendMessage', () => ({ ok: false, description: 'Bad Request: chat not found' }));

    const response = await SELF.fetch(webhookRequest(ownerMessage(10, '/start')));

    // Ошибку не глотаем: Telegram должен получить не-200 и повторить доставку.
    expect(response.status).toBeGreaterThanOrEqual(500);

    const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM telegram_updates WHERE update_id = 10').first<{
      n: number;
    }>();
    expect(row?.n).toBe(0);
  });
});
