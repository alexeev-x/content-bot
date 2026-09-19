import { env, SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { defaultSections } from 'src/core/sections';
import { createSections } from 'src/core/sections';
import { createTelegramApi } from 'src/core/telegram';
import { ownerMessage, telegramCalls, topicsRespond, webhookRequest } from './telegram-mock';

describe('разделы', () => {
  it('создаются сами при первом сообщении и не дублируются при втором', async () => {
    topicsRespond();

    await SELF.fetch(webhookRequest(ownerMessage(20, 'привет')));
    const afterFirst = telegramCalls('createForumTopic').length;

    await SELF.fetch(webhookRequest(ownerMessage(21, 'ещё раз')));

    expect(afterFirst).toBe(defaultSections.length);
    expect(telegramCalls('createForumTopic')).toHaveLength(defaultSections.length);

    const rows = await env.DB.prepare('SELECT COUNT(*) AS n FROM sections').first<{ n: number }>();
    expect(rows?.n).toBe(defaultSections.length);
  });
  it('одновременные ensure не создают дубли тем', async () => {
    topicsRespond();
    const make = (scope: string) =>
      createSections({
        d1: env.DB,
        telegram: createTelegramApi('1:test', { d1: env.DB, scope }),
        catalog: defaultSections,
      });
    const results = await Promise.allSettled([make('a').ensure(100), make('b').ensure(100)]);
    expect(results.some((result) => result.status === 'fulfilled')).toBe(true);
    await make('c').ensure(100);
    expect(telegramCalls('createForumTopic')).toHaveLength(defaultSections.length);
    expect(telegramCalls('sendMessage')).toHaveLength(defaultSections.length);
  });
});
