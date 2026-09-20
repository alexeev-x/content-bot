import { describe, expect, it, vi } from 'vitest';
import { createOpenAiTextGenerator } from 'src/core/ai';

describe('HTTP-контракт Responses API', () => {
  it('извлекает текст из output, передаёт схему и выбранную модель, учитывает её тариф', async () => {
    let body: Record<string, unknown> = {};
    const send = vi.fn(async (_url: unknown, init?: RequestInit) => {
      body = JSON.parse(String(init?.body));
      return Response.json({
        status: 'completed',
        output: [
          { type: 'reasoning' },
          {
            type: 'message',
            content: [
              { type: 'output_text', text: '{"reply":' },
              { type: 'output_text', text: '"Привет"}' },
            ],
          },
        ],
        usage: { input_tokens: 400, output_tokens: 200 },
      });
    });
    vi.stubGlobal('fetch', send);
    const ai = createOpenAiTextGenerator({
      apiKey: 'test-only',
      settings: async () => ({ model: 'gpt-5.6-luna', effort: 'low' }),
    });
    const result = await ai.generate({
      instructions: 'Тест',
      prompt: 'Привет',
      format: { name: 'test', schema: { type: 'object' } },
    });
    expect(result.text).toBe('{"reply":"Привет"}');
    expect(result.costMicros).toBe(320);
    expect(body).toMatchObject({
      model: 'gpt-5.6-luna',
      reasoning: { effort: 'low' },
      store: false,
      text: { format: { type: 'json_schema', strict: true, name: 'test' } },
    });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it.each([
    { status: 'incomplete', output: [] },
    { status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'Отказ' }] }] },
    { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: '' }] }] },
  ])('не принимает неполный ответ или отказ за готовый материал', async (response) => {
    const send = vi.fn(async () => Response.json({ ...response, usage: { input_tokens: 1, output_tokens: 1 } }));
    vi.stubGlobal('fetch', send);
    await expect(
      createOpenAiTextGenerator({ apiKey: 'test-only' }).generate({ instructions: 'Тест', prompt: 'Тест' }),
    ).rejects.toMatchObject({ code: 'outcome_unknown' });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('не выполняет сетевой запрос при пустом ключе', () => {
    expect(createOpenAiTextGenerator({ apiKey: '  ' }).configured).toBe(false);
  });
});
