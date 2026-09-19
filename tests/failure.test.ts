import { env, SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { onTelegram, ownerMessage, telegramCalls, topicsRespond, webhookRequest } from './telegram-mock';
import { defaultSections } from 'src/core/sections';

describe('восстановление апдейта', () => {
  it('сохраняет вход и тему при отказе приветствия; повтор не создаёт вторую тему', async () => {
    topicsRespond();
    onTelegram('sendMessage', () => ({ ok: false, error_code: 429, parameters: { retry_after: 0 } }));
    const update = ownerMessage(10, '/start');
    expect((await SELF.fetch(webhookRequest(update))).status).toBe(502);
    expect(
      await env.DB.prepare('SELECT state, payload FROM telegram_updates WHERE update_id = 10').first(),
    ).toMatchObject({ state: 'pending', payload: JSON.stringify(update) });
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM sections').first()).toEqual({ n: 1 });
    onTelegram('sendMessage', (_payload, index) => ({ ok: true, result: { message_id: index } }));
    expect((await SELF.fetch(webhookRequest(update))).status).toBe(200);
    expect(telegramCalls('createForumTopic')).toHaveLength(defaultSections.length);
  });
  it('не подтверждает занятую обработку, но восстанавливает просроченную аренду', async () => {
    topicsRespond();
    const update = ownerMessage(11, '/start');
    await env.DB.prepare(
      'INSERT INTO telegram_updates (update_id,received_at,state,payload,lease_until,owner) VALUES (?,0,?,?,?,?)',
    )
      .bind(11, 'processing', JSON.stringify(update), Date.now() + 120_000, 'dead')
      .run();
    expect((await SELF.fetch(webhookRequest(update))).status).toBe(503);
    expect(telegramCalls('createForumTopic')).toHaveLength(0);
    await env.DB.prepare('UPDATE telegram_updates SET lease_until = 0 WHERE update_id = 11').run();
    expect((await SELF.fetch(webhookRequest(update))).status).toBe(200);
    expect(await env.DB.prepare('SELECT state FROM telegram_updates WHERE update_id = 11').first()).toEqual({
      state: 'done',
    });
  });
  it('не повторяет отправку с неизвестным результатом при повторе webhook', async () => {
    topicsRespond();
    onTelegram('sendMessage', () => {
      throw new TypeError('response lost');
    });
    const update = ownerMessage(12, '/start');
    expect((await SELF.fetch(webhookRequest(update))).status).toBe(503);
    expect((await SELF.fetch(webhookRequest(update))).status).toBe(503);
    expect(telegramCalls('sendMessage')).toHaveLength(1);
    expect(telegramCalls('createForumTopic')).toHaveLength(1);
    expect(
      await env.DB.prepare("SELECT COUNT(*) AS n FROM telegram_operations WHERE state = 'unknown'").first(),
    ).toEqual({ n: 1 });
  });
});
