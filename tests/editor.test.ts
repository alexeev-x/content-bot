import { env, SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { createEditor } from 'src/modules/editor';
import { createEditorService } from 'src/modules/editor/service';
import type { EditorReply } from 'src/modules/editor/schema';
import type { TextGenerator } from 'src/modules/editor/types';
import { createTelegramApi } from 'src/core/telegram';
import { AppError } from 'src/lib/errors';
import { claimConversation, readConversation } from 'src/modules/editor/queries';
import { ownerCallback, ownerMessage, telegramCalls, topicsRespond, webhookRequest } from './telegram-mock';

const reply = (patch: Partial<EditorReply> = {}): EditorReply => ({
  action: 'reply',
  reply: 'Давай разовьём эту мысль.',
  content: null,
  rubricKey: null,
  continuesMaterial: false,
  evidence: null,
  memoryId: null,
  ...patch,
});
const input = (messageId: number, text: string, threadId = 1001) => ({
  chatId: 100,
  messageId,
  threadId,
  text,
  section: { key: 'editor', title: 'Тексты' },
});
const result = (decision: EditorReply) => ({
  text: JSON.stringify(decision),
  inputTokens: 400,
  outputTokens: 200,
  costMicros: 320,
});
const generatorWith = (decisions: EditorReply[]) => {
  const calls: Parameters<TextGenerator['generate']>[0][] = [];
  const generator: TextGenerator = {
    configured: true,
    generate: async (request) => {
      calls.push(request);
      const next = decisions.shift();
      if (!next) throw new AppError('internal', 'Не задан тестовый ответ');
      return result(next);
    },
  };
  return { generator, calls };
};

describe('редактор текстов', () => {
  it('передаёт свободную речь, короткое имя героя и опечатки модели без обязательных команд', async () => {
    const { generator, calls } = generatorWith([
      reply({ reply: 'Про Пуджа есть три захода.' }),
      reply({ reply: 'Берём самоиронию.' }),
      reply({ reply: 'Не понял последнюю фразу, уточни мысль.' }),
    ]);
    for (const [id, text] of [
      [1, 'Пудж'],
      [2, 'чето хочу смешное про катку'],
      [3, 'фыв'],
    ] as const) {
      const editor = createEditor({
        d1: env.DB,
        generator,
        telegram: createTelegramApi('1:test', { d1: env.DB, scope: 'editor-test:' + id }),
      });
      expect(await editor.textHandler(input(id, text))).toBe(true);
    }
    expect(calls.map((call) => JSON.parse(call.prompt).currentMessage)).toEqual([
      'Пудж',
      'чето хочу смешное про катку',
      'фыв',
    ]);
    expect(telegramCalls('sendMessage').at(-1)?.text).toContain('уточни мысль');
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM editor_materials').first()).toEqual({ n: 0 });
  });

  it('сохраняет обе стороны беседы между экземплярами сервиса и не требует рубрики', async () => {
    const { generator, calls } = generatorWith([
      reply({ reply: 'Предлагаю: 1. Хук в крипа. 2. Великий поход на фонтан.' }),
      reply({
        action: 'material',
        reply: 'Раскрываю второй заход.',
        content: 'Я называю это разведкой. Команда — фидом.',
      }),
    ]);
    await createEditorService({ d1: env.DB, generator }).generate(input(10, 'хочу смешной ролик'));
    await createEditorService({ d1: env.DB, generator }).generate(input(11, 'второй давай'));
    expect(JSON.parse(calls[1]!.prompt).history).toEqual([
      { user: 'хочу смешной ролик', assistant: 'Предлагаю: 1. Хук в крипа. 2. Великий поход на фонтан.' },
    ]);
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM editor_materials').first()).toEqual({ n: 1 });
  });

  it('сохраняет неизменяемые версии при правке и новый материал при смене темы', async () => {
    const { generator, calls } = generatorWith([
      reply({ action: 'material', content: 'Первая версия', rubricKey: 'teach-feeding' }),
      reply({
        action: 'material',
        content: 'Версия с новым началом',
        rubricKey: 'teach-feeding',
        continuesMaterial: true,
      }),
      reply({ action: 'material', content: 'Новый пост про обучение', rubricKey: 'learning-dota' }),
    ]);
    const service = createEditorService({ d1: env.DB, generator });
    await service.generate(input(20, 'давай про фид'));
    await service.generate(input(21, 'начало пожестче'));
    expect(JSON.parse(calls[1]!.prompt).currentMaterial.content).toBe('Первая версия');
    await service.generate(input(22, 'новая тема: учусь играть на саппорте'));
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM editor_materials').first()).toEqual({ n: 2 });
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM editor_material_versions').first()).toEqual({ n: 3 });
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM editor_memory').first()).toEqual({ n: 0 });
  });

  it('не смешивает историю и текущий материал разных тем', async () => {
    const { generator, calls } = generatorWith([reply({ action: 'material', content: 'Старая работа' }), reply()]);
    const service = createEditorService({ d1: env.DB, generator });
    await service.generate(input(30, 'первый разговор'));
    await service.generate(input(31, 'другая тема', 2002));
    expect(JSON.parse(calls[1]!.prompt).history).toEqual([]);
    expect(JSON.parse(calls[1]!.prompt).currentMaterial).toBeNull();
  });

  it('повтор не вызывает ИИ и не создаёт вторую версию', async () => {
    const { generator, calls } = generatorWith([reply({ action: 'material', content: 'Готовый пост' })]);
    const service = createEditorService({ d1: env.DB, generator });
    const first = await service.generate(input(40, 'хочу пост'));
    const second = await service.generate(input(40, 'хочу пост'));
    expect(second).toEqual({ ...first, reused: true });
    expect(calls).toHaveLength(1);
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM editor_material_versions').first()).toEqual({ n: 1 });
    expect(await env.DB.prepare('SELECT charged_cost_micros FROM editor_generations').first()).toEqual({
      charged_cost_micros: 320,
    });
  });

  it('понимает постоянное предпочтение без слова запомни, заменяет и отменяет с историей', async () => {
    const { generator, calls } = generatorWith([
      reply({ action: 'remember', content: 'Короткие предложения', evidence: 'В моих постах всегда пиши коротко' }),
    ]);
    const service = createEditorService({ d1: env.DB, generator });
    await service.generate(input(50, 'В моих постах всегда пиши коротко'));
    const [rule] = await service.memory();
    const change = generatorWith([
      reply({
        action: 'remember',
        content: 'Подробные разборы',
        memoryId: rule!.id,
        evidence: 'Замени правило краткости',
      }),
    ]);
    await createEditorService({ d1: env.DB, generator: change.generator }).generate(
      input(51, 'Замени правило краткости: я хочу подробные разборы'),
    );
    expect(JSON.parse(change.calls[0]!.prompt).memory[0].value).toBe('Короткие предложения');
    const [updated] = await service.memory();
    const forget = generatorWith([
      reply({ action: 'forget', memoryId: updated!.id, evidence: 'Отмени правило подробности' }),
    ]);
    await createEditorService({ d1: env.DB, generator: forget.generator }).generate(
      input(52, 'Отмени правило подробности'),
    );
    expect(await service.memory()).toEqual([]);
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM editor_memory').first()).toEqual({ n: 2 });
    expect(calls).toHaveLength(1);
  });

  it('подаёт авторские примеры с рубрикой и не превращает ответ ИИ в эталон', async () => {
    const content = 'Я умираю на линии так уверенно, что это уже план.';
    const { generator, calls } = generatorWith([
      reply({
        action: 'save_example',
        content,
        rubricKey: 'teach-feeding',
        evidence: 'Это мой текст, используй как образец',
      }),
      reply({ action: 'material', content: 'Новый вариант в похожем ритме', rubricKey: 'teach-feeding' }),
    ]);
    const service = createEditorService({ d1: env.DB, generator });
    await service.generate(input(60, 'Это мой текст, используй как образец: ' + content));
    await service.generate(input(61, 'теперь что-нибудь про саппорта'));
    expect(
      JSON.parse(calls[1]!.prompt).examples.find((item: { rubricKey: string }) => item.rubricKey === 'teach-feeding')
        .texts,
    ).toContain(content);
    expect(
      await env.DB.prepare("SELECT COUNT(*) AS n FROM editor_materials WHERE kind = 'author_example'").first(),
    ).toEqual({ n: 1 });
  });

  it('не применяет действие без подтверждающей фразы текущего сообщения', async () => {
    const { generator, calls } = generatorWith([
      reply({ action: 'remember', content: 'Всегда шути', evidence: 'запомни' }),
    ]);
    const service = createEditorService({ d1: env.DB, generator });
    await expect(service.generate(input(70, 'здесь добавь шутку'))).rejects.toMatchObject({ code: 'outcome_unknown' });
    await expect(service.generate(input(70, 'здесь добавь шутку'))).rejects.toMatchObject({ code: 'outcome_unknown' });
    expect(await service.memory()).toEqual([]);
    expect(calls).toHaveLength(1);
    expect((await env.DB.prepare('SELECT state FROM editor_generations').first())?.state).toBe('unknown');
  });

  it('не обнуляет резерв и не повторяет запрос после неизвестного исхода', async () => {
    let calls = 0;
    const service = createEditorService({
      d1: env.DB,
      generator: {
        configured: true,
        generate: async () => {
          calls++;
          throw new AppError('outcome_unknown', 'Таймаут');
        },
      },
    });
    await expect(service.generate(input(80, 'нужна идея'))).rejects.toMatchObject({ code: 'outcome_unknown' });
    await expect(service.generate(input(80, 'нужна идея'))).rejects.toMatchObject({ code: 'outcome_unknown' });
    const row = await env.DB.prepare(
      'SELECT reserved_cost_micros, charged_cost_micros FROM editor_generations',
    ).first();
    expect(row?.charged_cost_micros).toBe(row?.reserved_cost_micros);
    expect(calls).toBe(1);
  });

  it('не выполняет выдуманное моделью действие публикации', async () => {
    const service = createEditorService({
      d1: env.DB,
      generator: {
        configured: true,
        generate: async () => ({
          ...result(reply()),
          text: JSON.stringify({ ...reply(), action: 'publish' }),
        }),
      },
    });
    await expect(service.generate(input(90, 'новый текст'))).rejects.toMatchObject({ code: 'outcome_unknown' });
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM editor_materials').first()).toEqual({ n: 0 });
  });

  it('сериализует две одновременные правки одного диалога', async () => {
    let unlock!: () => void;
    let started!: () => void;
    const waiting = new Promise<void>((resolve) => {
      unlock = resolve;
    });
    const entered = new Promise<void>((resolve) => {
      started = resolve;
    });
    let calls = 0;
    const service = createEditorService({
      d1: env.DB,
      generator: {
        configured: true,
        generate: async () => {
          calls++;
          started();
          await waiting;
          return result(reply());
        },
      },
    });
    const first = service.generate(input(100, 'первая мысль'));
    await entered;
    try {
      await expect(service.generate(input(101, 'вторая мысль'))).rejects.toMatchObject({ code: 'operation_busy' });
    } finally {
      unlock();
    }
    await first;
    expect(calls).toBe(1);
  });

  it('поздний ответ потерявшего аренду обработчика не меняет материал', async () => {
    const message = input(110, 'новая идея');
    const service = createEditorService({
      d1: env.DB,
      generator: {
        configured: true,
        generate: async () => {
          await env.DB.prepare('UPDATE editor_conversations SET lock_until = 0').run();
          expect(await claimConversation(env.DB, message, 'new-owner')).toBe(true);
          return result(reply({ action: 'material', content: 'Устаревший ответ' }));
        },
      },
    });
    await expect(service.generate(message)).rejects.toMatchObject({ code: 'outcome_unknown' });
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM editor_materials').first()).toEqual({ n: 0 });
    expect((await readConversation(env.DB, 100, 1001))?.lockToken).toBe('new-owner');
  });

  it('останавливает запрос до API при исчерпанном бюджете', async () => {
    const { generator, calls } = generatorWith([reply()]);
    const service = createEditorService({ d1: env.DB, generator });
    await service.generate(input(120, 'привет'));
    await env.DB.prepare('UPDATE editor_generations SET charged_cost_micros = 15000000').run();
    await expect(service.generate(input(121, 'дай идею'))).rejects.toMatchObject({ code: 'budget_exhausted' });
    expect(calls).toHaveLength(1);
  });

  it('история ограничена последними шестью обменами', async () => {
    const { generator, calls } = generatorWith(Array.from({ length: 8 }, () => reply()));
    const service = createEditorService({ d1: env.DB, generator });
    for (let n = 0; n < 8; n++) await service.generate(input(130 + n, 'мысль ' + n));
    const history = JSON.parse(calls[7]!.prompt).history;
    expect(history).toHaveLength(6);
    expect(history[0].user).toBe('мысль 1');
  });

  it('разбивает длинный материал на сообщения без потери текста', async () => {
    const decision = reply({ action: 'material', content: 'Я🎮'.repeat(2000) });
    const { generator } = generatorWith([decision]);
    const editor = createEditor({
      d1: env.DB,
      generator,
      telegram: createTelegramApi('1:test', { d1: env.DB, scope: 'long' }),
    });
    await editor.textHandler(input(150, 'хочу статью'));
    const sent = telegramCalls('sendMessage');
    expect(sent.length).toBeGreaterThan(1);
    expect(sent.every((call) => String(call.text).length <= 4096)).toBe(true);
    expect(sent.map((call) => call.text).join('')).toBe(decision.reply + '\n\n' + decision.content);
  });

  it('при отсутствии ключа объясняет ограничение без ложного понимания или сохранения', async () => {
    topicsRespond();
    await SELF.fetch(webhookRequest(ownerMessage(160, '/start')));
    expect((await SELF.fetch(webhookRequest(ownerMessage(161, 'Пудж', 1001)))).status).toBe(200);
    expect(telegramCalls('sendMessage').at(-1)?.text).toContain('не подключён к ИИ');
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM editor_materials').first()).toEqual({ n: 0 });
  });

  it('сохраняет разделение общего help и помощи редактора', async () => {
    topicsRespond();
    await SELF.fetch(webhookRequest(ownerMessage(170, '/start')));
    await SELF.fetch(webhookRequest(ownerMessage(171, '/help', 1001)));
    expect(telegramCalls('sendMessage').at(-1)?.text).toContain('Тексты');
    expect(telegramCalls('sendMessage').at(-1)?.text).not.toContain('/rubrics');
    await SELF.fetch(webhookRequest(ownerMessage(172, '/help')));
    expect(telegramCalls('sendMessage').at(-1)?.text).toContain('Общие команды:');
  });

  it('меняет глобальную модель через callback-кнопки', async () => {
    topicsRespond();
    expect((await SELF.fetch(webhookRequest(ownerMessage(180, '/settings')))).status).toBe(200);
    expect((await SELF.fetch(webhookRequest(ownerCallback(181, 'settings:model:gpt-5.6-luna')))).status).toBe(200);
    expect((await SELF.fetch(webhookRequest(ownerCallback(182, 'settings:effort:high:gpt-5.6-luna')))).status).toBe(
      200,
    );
    expect((await SELF.fetch(webhookRequest(ownerCallback(183, 'settings:confirm:gpt-5.6-luna:high')))).status).toBe(
      200,
    );
    expect(await env.DB.prepare("SELECT model, effort FROM settings_ai WHERE key = 'default'").first()).toEqual({
      model: 'gpt-5.6-luna',
      effort: 'high',
    });
  });
});
