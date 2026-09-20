import { env, SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { ownerMessage, telegramCalls, topicsRespond, webhookRequest } from './telegram-mock';

describe('редактор текстов', () => {
  it('сохраняет текст автора один раз и привязывает названную рубрику', async () => {
    topicsRespond();
    await SELF.fetch(webhookRequest(ownerMessage(1, '/start')));

    const update = ownerMessage(2, 'Учу фидить в Доту: вот мой сырой текст для ролика.', 1001);
    expect((await SELF.fetch(webhookRequest(update))).status).toBe(200);
    expect((await SELF.fetch(webhookRequest(update))).status).toBe(200);

    expect(
      await env.DB.prepare('SELECT kind, rubric_key FROM editor_materials WHERE source_message_id = ?').bind(2).first(),
    ).toEqual({ kind: 'draft', rubric_key: 'teach-feeding' });
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM editor_material_versions').first()).toEqual({ n: 1 });
    expect(telegramCalls('sendMessage').at(-1)?.text).toContain('Сохранил как черновик');
  });

  it('запоминает только явное правило и не дублирует его при повторе update', async () => {
    topicsRespond();
    await SELF.fetch(webhookRequest(ownerMessage(10, '/start')));

    const update = ownerMessage(11, 'запомни не добавляй выдуманные личные факты', 1001);
    await SELF.fetch(webhookRequest(update));
    await SELF.fetch(webhookRequest(update));

    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM editor_memory').first()).toEqual({ n: 1 });
    expect((await SELF.fetch(webhookRequest(ownerMessage(12, 'что ты запомнил', 1001)))).status).toBe(200);
    expect(telegramCalls('sendMessage').at(-1)?.text).toContain('не добавляй выдуманные личные факты');
  });

  it('отделяет служебную просьбу от сохранённого авторского примера', async () => {
    topicsRespond();
    await SELF.fetch(webhookRequest(ownerMessage(20, '/start')));

    await SELF.fetch(
      webhookRequest(ownerMessage(21, 'Сохрани как пример:\nЯ умираю на линии так уверенно, что это уже план.', 1001)),
    );

    expect(
      await env.DB.prepare(
        'SELECT m.kind, v.content FROM editor_materials m JOIN editor_material_versions v ON v.material_id = m.id WHERE m.source_message_id = ?',
      )
        .bind(21)
        .first(),
    ).toEqual({ kind: 'author_example', content: 'Я умираю на линии так уверенно, что это уже план.' });
  });

  it('показывает в /help полный список возможностей раздела', async () => {
    topicsRespond();
    await SELF.fetch(webhookRequest(ownerMessage(30, '/start')));

    await SELF.fetch(webhookRequest(ownerMessage(31, '/help', 1001)));

    const help = telegramCalls('sendMessage').at(-1)?.text;
    expect(help).toContain('Тексты: что можно делать сейчас');
    expect(help).toContain('Сохрани как пример');
    expect(help).toContain('/rubrics');
  });

  it('оставляет общий /help справкой по боту, а не по текстам', async () => {
    topicsRespond();
    await SELF.fetch(webhookRequest(ownerMessage(40, '/start')));

    await SELF.fetch(webhookRequest(ownerMessage(41, '/help')));

    const help = telegramCalls('sendMessage').at(-1)?.text;
    expect(help).toContain('Общие команды:');
    expect(help).toContain('/setup');
    expect(help).not.toContain('Сохрани как пример');
  });
});
