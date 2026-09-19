import { env, SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { ownerMessage, telegramCalls, topicsRespond, webhookRequest } from './telegram-mock';

const countUpdates = async () => {
  const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM telegram_updates').first<{ n: number }>();
  return row?.n ?? 0;
};

describe('webhook', () => {
  it('не принимает владельца в групповом чате', async () => {
    const update = ownerMessage(7, '/start');
    update.message.chat = { id: -100, type: 'supergroup' };
    expect((await SELF.fetch(webhookRequest(update))).status).toBe(200);
    expect(await countUpdates()).toBe(0);
    expect(telegramCalls('createForumTopic')).toHaveLength(0);
  });

  it('возвращает 400 для некорректного тела', async () => {
    expect((await SELF.fetch(webhookRequest({ update_id: 'bad' }))).status).toBe(400);
    expect(await countUpdates()).toBe(0);
  });
  it('не пускает без заголовка с секретом', async () => {
    const response = await SELF.fetch(webhookRequest(ownerMessage(1, '/start'), null));

    expect(response.status).toBe(401);
    expect(await countUpdates()).toBe(0);
  });

  it('не пускает с неверным секретом', async () => {
    const response = await SELF.fetch(webhookRequest(ownerMessage(2, '/start'), 'wrong'));

    expect(response.status).toBe(401);
    expect(await countUpdates()).toBe(0);
  });

  it('молча игнорирует чужого отправителя и не отмечает апдейт', async () => {
    topicsRespond();

    const stranger = ownerMessage(3, 'привет');
    stranger.message.from.id = 999;

    const response = await SELF.fetch(webhookRequest(stranger));

    expect(response.status).toBe(200);
    expect(telegramCalls('sendMessage')).toHaveLength(0);
    expect(await countUpdates()).toBe(0);
  });

  it('обрабатывает повторную доставку только один раз', async () => {
    topicsRespond();

    const update = ownerMessage(4, '/start');
    await SELF.fetch(webhookRequest(update));
    const sentAfterFirst = telegramCalls('sendMessage').filter(
      (call) => call.text === 'На связи. Что умею — /help, разделы — /setup.',
    ).length;

    await SELF.fetch(webhookRequest(update));
    const sentAfterSecond = telegramCalls('sendMessage').filter(
      (call) => call.text === 'На связи. Что умею — /help, разделы — /setup.',
    ).length;

    expect(sentAfterFirst).toBe(1);
    expect(sentAfterSecond).toBe(1);
    expect(await countUpdates()).toBe(1);
  });

  it('отвечает в ту же тему, откуда пришло сообщение', async () => {
    topicsRespond();

    await SELF.fetch(webhookRequest(ownerMessage(5, '/start', 777)));

    const reply = telegramCalls('sendMessage').find(
      (call) => call.text === 'На связи. Что умею — /help, разделы — /setup.',
    );
    expect(reply?.message_thread_id).toBe(777);
  });
});
