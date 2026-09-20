import { env, SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { createEditorService } from 'src/modules/editor/service';
import { ownerCallback, ownerMessage, telegramCalls, topicsRespond, webhookRequest } from './telegram-mock';

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
    expect(help).toContain('Какие у меня рубрики');
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

  it('сохраняет результат генерации и не оплачивает повтор того же update', async () => {
    let calls = 0;
    const editor = createEditorService({
      d1: env.DB,
      generator: {
        configured: true,
        generate: async () => {
          calls += 1;
          return { text: 'Готовый сценарий без выдуманных фактов.', inputTokens: 400, outputTokens: 200 };
        },
      },
    });
    const input = {
      chatId: 1,
      messageId: 50,
      threadId: 1001,
      text: 'Напиши сценарий про Пуджа для Учу фидить в Доту',
    };

    const first = await editor.generate(input);
    const second = await editor.generate(input);

    expect(first).toEqual({ text: 'Готовый сценарий без выдуманных фактов.', reused: false });
    expect(second).toEqual({ text: 'Готовый сценарий без выдуманных фактов.', reused: true });
    expect(calls).toBe(1);
    expect(
      await env.DB.prepare(
        'SELECT state, input_tokens, output_tokens, charged_cost_micros FROM editor_generations',
      ).first(),
    ).toEqual({ state: 'succeeded', input_tokens: 400, output_tokens: 200, charged_cost_micros: 3200 });
    expect(
      await env.DB.prepare("SELECT COUNT(*) AS n FROM editor_material_versions WHERE source = 'assistant'").first(),
    ).toEqual({
      n: 1,
    });
  });

  it('распознаёт русскую просьбу о генерации, а не сохраняет её как обычный черновик', () => {
    const editor = createEditorService({
      d1: env.DB,
      generator: {
        configured: true,
        generate: async () => ({ text: 'Не используется в этой проверке.', inputTokens: 0, outputTokens: 0 }),
      },
    });

    expect(editor.isGenerationRequest('Придумай темы для Учу фидить в Доту')).toBe(true);
  });

  it('объясняет отсутствие ключа ИИ в чате и подтверждает update', async () => {
    topicsRespond();
    await SELF.fetch(webhookRequest(ownerMessage(60, '/start')));

    const response = await SELF.fetch(webhookRequest(ownerMessage(61, 'Придумай темы для Учу фидить в Доту', 1001)));

    expect(response.status).toBe(200);
    expect(telegramCalls('sendMessage').at(-1)?.text).toContain('OPENAI_API_KEY');
  });

  it('меняет глобальную модель и reasoning через callback-кнопки', async () => {
    topicsRespond();
    expect((await SELF.fetch(webhookRequest(ownerMessage(70, '/settings')))).status).toBe(200);
    expect(telegramCalls('sendMessage').at(-1)?.reply_markup).toBeTruthy();

    expect((await SELF.fetch(webhookRequest(ownerCallback(71, 'settings:model:gpt-5.6-luna')))).status).toBe(200);
    expect((await SELF.fetch(webhookRequest(ownerCallback(72, 'settings:effort:high:gpt-5.6-luna')))).status).toBe(200);
    expect((await SELF.fetch(webhookRequest(ownerCallback(73, 'settings:confirm:gpt-5.6-luna:high')))).status).toBe(
      200,
    );
    expect(await env.DB.prepare("SELECT model, effort FROM settings_ai WHERE key = 'default'").first()).toEqual({
      model: 'gpt-5.6-luna',
      effort: 'high',
    });
    expect(telegramCalls('editMessageText').at(-1)?.text).toContain('Сохранено для всего бота');
  });
});
