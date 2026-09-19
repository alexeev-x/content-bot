import { env, SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { defaultSections } from 'src/core/sections';
import { ownerMessage, telegramCalls, topicsRespond, webhookRequest } from './telegram-mock';

describe('разделы', () => {
  /**
   * Файл отдельный намеренно: «разделы на месте» кэшируется на изоляте, и в общем файле
   * следующий тест увидел бы чужой кэш.
   */
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
});
