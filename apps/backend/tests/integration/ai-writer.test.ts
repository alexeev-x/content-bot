import type { UpdateAiSettingsInput } from '@alexeev/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  AiProviderError,
  type AiTextProvider,
  approveDraft,
  attachPost,
  createD1AiRepository,
  createD1AuthorProfileRepository,
  createD1WriterRepository,
  generateDraft,
  publishableText,
  saveOwnerEdit,
  updateAiSettings,
  type WriterDeps
} from '../../src/modules/ai';
import { changedParts, checkDraft, editRatio } from '../../src/modules/ai/writer-checks';
import { parseWriterOutput, pickExamples } from '../../src/modules/ai/writer-prompt';
import { writerIntent } from '../../src/app/bot/ai-writer';
import { AppError } from '../../src/shared/app-error';
import { testDb } from '../helpers/db';
import { fakeClock, resetDb } from '../helpers/harness';

const SETTINGS: Omit<UpdateAiSettingsInput, 'revision'> = {
  provider: 'openai',
  enabled: true,
  draftModel: 'gpt-6.1-sol',
  cheapModel: 'gpt-6-luna',
  prices: [],
  monthlyBudgetUsd: 5,
  dailyCapUsd: 1,
  warnAtPercent: 80
};

const ANSWER = [
  'ХУКИ:',
  '- Я апнул 3к и понял одну вещь.',
  '- Три тысячи ММР, и я всё ещё фидлю.',
  '- Апнул 3к. Рассказываю, как.',
  'ТЕКСТ:',
  'Я апнул 3к и понял одну вещь. Варды решают больше, чем мой фарм. Дальше будет только лучше, подпишись.'
].join('\n');

let ids = 0;
function deps(provider: AiTextProvider | null): WriterDeps {
  const db = testDb();
  return {
    repo: createD1AiRepository(db),
    writer: createD1WriterRepository(db),
    profiles: createD1AuthorProfileRepository(db),
    clock: fakeClock(),
    timezone: 'UTC',
    newId: () => `00000000-0000-4000-8000-${String((ids += 1)).padStart(12, '0')}`,
    provider
  };
}

const answering = (text: string): AiTextProvider => ({
  provider: 'openai',
  complete: () =>
    Promise.resolve({
      text,
      model: 'gpt-6.1-sol',
      usage: { inputTokens: 3000, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 400 }
    })
});

const draft = (writer: WriterDeps, task = 'как я апнул 3к') =>
  generateDraft(writer, {
    format: 'igrat',
    mode: 'direct',
    source: 'bot',
    task,
    signal: AbortSignal.timeout(1000)
  });

beforeEach(async () => {
  await resetDb();
  await updateAiSettings({ repo: createD1AiRepository(testDb()), clock: fakeClock() }, { revision: 0, ...SETTINGS });
});

describe('AI writer', () => {
  it('stores a draft as AI_DRAFT with its hooks and usage, and it is not publishable until approved', async () => {
    const writer = deps(answering(ANSWER));
    const result = await draft(writer);
    expect(result.generation).toMatchObject({ status: 'ready' });
    expect(result.generation.hooks).toHaveLength(3);
    const revisions = await writer.writer.revisions(result.generation.id);
    expect(revisions.map((revision) => revision.provenance)).toEqual(['AI_DRAFT']);
    const usage = await testDb()
      .prepare('SELECT g.usage_id AS usageId, u.kind FROM ai_generations g JOIN ai_usage u ON u.id = g.usage_id')
      .first<{ kind: string }>();
    expect(usage?.kind).toBe('draft');

    // The server-side guard: an AI draft and an owner edit are not enough.
    await expect(publishableText(writer, result.generation.id)).rejects.toMatchObject({
      code: 'CONFLICT',
      details: { reason: 'NOT_APPROVED' }
    });
    await saveOwnerEdit(writer, result.generation.id, `${result.text ?? ''} Мой вывод.`);
    await expect(publishableText(writer, result.generation.id)).rejects.toBeInstanceOf(AppError);

    const first = await approveDraft(writer, result.generation.id);
    expect(first).toMatchObject({ created: true, revision: { provenance: 'OWNER_APPROVED' } });
    expect(first.revision.editRatio).toBeGreaterThan(0);
    expect((await publishableText(writer, result.generation.id)).text).toContain('Мой вывод.');
    // A repeated tap returns the same approval; edits after approval are refused.
    const again = await approveDraft(writer, result.generation.id);
    expect(again).toMatchObject({ created: false, revision: { id: first.revision.id } });
    await expect(saveOwnerEdit(writer, result.generation.id, 'другое')).rejects.toMatchObject({ code: 'CONFLICT' });
    // The post link outlives the idempotency key: a later tap finds the post instead of making another.
    await attachPost(writer, first.revision.id, 'post-1');
    expect((await publishableText(writer, result.generation.id)).postId).toBe('post-1');
  });

  it('learns the voice only from texts the owner changed and approved, in the same format', async () => {
    const inputs: string[] = [];
    const writer = deps({
      provider: 'openai',
      complete: (request) => {
        inputs.push(request.input);
        return answering(ANSWER).complete(request);
      }
    });
    // Changed and approved: the owner's words, the only style evidence.
    const edited = await draft(writer);
    await saveOwnerEdit(writer, edited.generation.id, 'Свой текст: варды важнее фарма, проверено на Лионе.');
    await approveDraft(writer, edited.generation.id);
    // Approved without a change: the model's words, and an AI draft never approved — both stay out.
    const unchanged = await draft(writer);
    await approveDraft(writer, unchanged.generation.id);
    await draft(writer);
    // Another format's owner text does not leak into this one.
    const post = await generateDraft(writer, {
      format: 'telegram',
      mode: 'direct',
      source: 'bot',
      task: 'пост про патч',
      signal: AbortSignal.timeout(1000)
    });
    await saveOwnerEdit(writer, post.generation.id, 'Телеграм-текст автора про патч и нерфы.');
    await approveDraft(writer, post.generation.id);

    await draft(writer, 'как я учусь вардить');
    const prompt = inputs.at(-1) ?? '';
    expect(prompt).toContain('Свой текст: варды важнее фарма, проверено на Лионе.');
    expect(prompt.match(/Пример \(текст автора/g)).toHaveLength(1);
    expect(prompt).not.toContain('Телеграм-текст автора');
    // The owner's text sits right before the task: the most relevant example comes last.
    expect(prompt.indexOf('Свой текст:')).toBeGreaterThan(prompt.lastIndexOf('Пример ('));
  });

  it('stores the changed parts on approval and counts them for «Качество»', async () => {
    const writer = deps(answering(ANSWER));
    const edited = await draft(writer);
    const text = (edited.text ?? '').replace('Я апнул 3к и понял одну вещь.', 'Три тысячи ММР, а я всё ещё фидлю.');
    await saveOwnerEdit(writer, edited.generation.id, text);
    await approveDraft(writer, edited.generation.id);
    const unchanged = await draft(writer);
    await approveDraft(writer, unchanged.generation.id);

    const quality = await writer.writer.quality(0);
    expect(quality.tagged).toBe(2);
    // One of the two approvals rewrote the hook; the unchanged one tagged nothing.
    expect(quality.changedParts).toEqual([{ part: 'hook', count: 1 }]);
  });

  it('marks a question for the owner instead of checking it as a script', async () => {
    const result = await draft(deps(answering('Как у тебя прошли игры на Личе: что понравилось, где накосячил?')));
    expect(result.generation.warnings).toEqual(['NEEDS_FACTS']);
  });

  it('refuses before any row when AI is off, and stores a provider failure', async () => {
    await expect(draft(deps(null))).rejects.toMatchObject({ code: 'UNAVAILABLE', details: { reason: 'NO_KEY' } });
    expect(await deps(null).writer.recent(10)).toHaveLength(0);

    const failing: AiTextProvider = {
      provider: 'openai',
      complete: () => Promise.reject(new AiProviderError('AI_TIMEOUT'))
    };
    const result = await draft(deps(failing));
    expect(result).toMatchObject({ text: null, generation: { status: 'failed', errorCode: 'AI_TIMEOUT' } });
  });
});

describe('/redactor chat', () => {
  it('keeps the conversation open with its history until it expires or is closed', async () => {
    const repo = createD1WriterRepository(testDb());
    await repo.openRequest({ chatId: 1, promptMessageId: 10, now: 0, expiresAt: 1000 });
    expect(await repo.touchRequest(1, 2, 2000)).toEqual({ kind: 'editor', history: [], format: null });
    // A button picks the format of the next message; a button of an older /redactor changes nothing.
    expect(await repo.setRequestFormat({ chatId: 1, promptMessageId: 9, format: 'igrat', now: 3 })).toBe(false);
    expect(await repo.setRequestFormat({ chatId: 1, promptMessageId: 10, format: 'igrat', now: 3 })).toBe(true);
    expect((await repo.touchRequest(1, 4, 2000))?.format).toBe('igrat');
    await repo.setRequestFormat({ chatId: 1, promptMessageId: null, format: null, now: 5 });
    await repo.saveHistory(1, [
      { role: 'owner', text: 'привет' },
      { role: 'editor', text: 'здарова' }
    ]);
    // The second message is still in the chat (not a plain draft) and sees the first turn.
    expect(await repo.touchRequest(1, 1500, 3000)).toEqual({
      kind: 'editor',
      history: [
        { role: 'owner', text: 'привет' },
        { role: 'editor', text: 'здарова' }
      ],
      format: null
    });
    expect(await repo.touchRequest(1, 3000, 4000)).toBeNull();
    await repo.openRequest({ chatId: 1, promptMessageId: 11, now: 0, expiresAt: 1000 });
    await repo.closeRequest(1);
    expect(await repo.touchRequest(1, 1, 2000)).toBeNull();
  });
});

describe('AI writer checks', () => {
  it('flags invented experience only in automatic mode, and AI phrases always', () => {
    const text = 'Патч 7.40 вышел. Я попробовал нового героя, мне понравилось. Стоит отметить, что это важно.';
    expect(checkDraft('telegram', 'automatic', text)).toEqual(
      expect.arrayContaining(['INVENTED_EXPERIENCE', 'AI_PHRASE:стоит отметить'])
    );
    expect(checkDraft('telegram', 'direct', text)).not.toContain('INVENTED_EXPERIENCE');
    expect(checkDraft('telegram', 'automatic', 'Патч 7.40 вышел: Тинкер снова в игре.')).toEqual([]);
  });

  it('keeps a held-out original out of the examples, so a control run is not a copy', () => {
    const task = 'Как правильно ставить варды?';
    expect(pickExamples('fidit', task).join('\n')).toContain('Как правильно ставить варды?');
    expect(pickExamples('fidit', task, ['uchu-fidit-wards']).join('\n')).not.toContain(
      '«Как правильно ставить варды?»'
    );
  });

  it('flags self-doubt in «Учу фидить» and a repeated «мужчины» (owner feedback 16.10.2026)', () => {
    expect(checkDraft('fidit', 'direct', 'Вообще, мой тупой мозг и так путается в кнопках.')).toContain(
      'FIDIT_SELF_DOUBT'
    );
    expect(checkDraft('igrat', 'direct', 'Мой тупой мозг этого не умеет.')).not.toContain('FIDIT_SELF_DOUBT');
    expect(checkDraft('telegram', 'direct', 'Мужчины, стрим. Мужчины, заходите.')).toContain('ADDRESS_REPEATED');
    expect(checkDraft('telegram', 'direct', 'Мужчины, стрим в 20:00.')).not.toContain('ADDRESS_REPEATED');
  });

  it('parses hooks and text, and measures the owner edit', () => {
    expect(parseWriterOutput(ANSWER)).toMatchObject({
      hooks: expect.any(Array),
      text: expect.stringMatching(/^Я апнул/)
    });
    expect(parseWriterOutput('просто текст')).toEqual({ hooks: [], text: 'просто текст' });
    expect(editRatio('раз два три четыре', 'раз два три четыре')).toBe(0);
    expect(editRatio('раз два три четыре', 'раз два пять шесть')).toBe(0.5);
  });

  it('tags which parts of the draft the owner changed, by code', () => {
    const draft =
      'Я апнул 3к и понял одну вещь. Давайте разберёмся, почему варды решают больше фарма. ' +
      'Ставлю их на рунах и у Рошана. Подпишись, дальше будет только лучше.';
    // Only the middle touched: no part tag.
    expect(changedParts(draft, draft.replace('у Рошана', 'возле Рошана'))).toEqual([]);
    // A new first line, a removed AI phrase, swearing added and a new ending in its own paragraph.
    const final =
      'Три тысячи ММР, а я всё ещё фидлю. Варды решают больше фарма. Ставлю их на рунах и у Рошана, блять.' +
      '\n\nКороче, ставь варды.';
    expect(changedParts(draft, final)).toEqual(['hook', 'ending', 'structure', 'swearing', 'ai_wording']);
    // Cut by more than a fifth: length.
    expect(changedParts(draft, 'Я апнул 3к и понял одну вещь. Подпишись, дальше будет только лучше.')).toContain(
      'length'
    );
  });

  it('reads a writing request in plain words and leaves other text a plain draft', () => {
    expect(writerIntent('напиши пост в тг про новый патч')).toMatchObject({ format: 'telegram' });
    expect(writerIntent('Сделай рилс учусь играть про варды')).toMatchObject({ format: 'igrat' });
    expect(writerIntent('придумай сценарий учу фидить на пуджа')).toMatchObject({ format: 'fidit' });
    expect(writerIntent('Сегодня стрим в 20:00')).toBeNull();
    expect(writerIntent('напиши мне потом')).toBeNull();
  });
});
