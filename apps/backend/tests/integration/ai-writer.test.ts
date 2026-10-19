import type { UpdateAiSettingsInput } from '@alexeev/contracts';
import { applyD1Migrations, env } from 'cloudflare:test';
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
  recordFeedback,
  saveOwnerEdit,
  updateAiSettings,
  type WriterDeps
} from '../../src/modules/ai';
import { changedParts, checkDraft, editRatio } from '../../src/modules/ai/writer-checks';
import { buildWriterPrompt, overusedPhrases, pickExamples, rankOwnerTexts } from '../../src/modules/ai/writer-prompt';
import { authorStateText } from '../../src/modules/ai/author-profile';
import { writerIntent } from '../../src/app/bot/ai-writer';
import { AppError } from '../../src/shared/app-error';
import { testDb } from '../helpers/db';
import { fakeClock, resetDb } from '../helpers/harness';
import { writerAnswer } from '../helpers/writer-answer';

const SETTINGS: Omit<UpdateAiSettingsInput, 'revision'> = {
  provider: 'openai',
  enabled: true,
  draftModel: 'gpt-6.1-sol',
  cheapModel: 'gpt-6-luna',
  videoReviews: false,
  prices: [],
  monthlyBudgetUsd: 5,
  dailyCapUsd: 1,
  warnAtPercent: 80
};

const ANSWER = writerAnswer({
  hooks: ['Я апнул 3к и понял одну вещь.', 'Три тысячи ММР, и я всё ещё фидлю.', 'Апнул 3к. Рассказываю, как.'],
  text: 'Я апнул 3к и понял одну вещь. Варды решают больше, чем мой фарм. Дальше будет только лучше, подпишись.',
  topic: 'апнул 3к и понял про варды',
  device: 'признание новичка',
  ending: 'призыв подписаться'
});

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

  it('the D1 write guard cannot append an edit after approval', async () => {
    const writer = deps(answering(ANSWER));
    const result = await draft(writer);
    await approveDraft(writer, result.generation.id);
    const inserted = await writer.writer.addRevision({
      id: crypto.randomUUID(),
      generationId: result.generation.id,
      parentId: null,
      provenance: 'OWNER_EDITED',
      text: 'Поздняя версия',
      editRatio: null,
      createdAt: fakeClock().now()
    });
    expect(inserted).toBe(false);
    expect((await writer.writer.revisions(result.generation.id)).map((revision) => revision.provenance)).toEqual([
      'AI_DRAFT',
      'OWNER_APPROVED'
    ]);
  });

  it('approval rereads the text when an owner edit arrives before its guarded insert', async () => {
    const writer = deps(answering(ANSWER));
    const result = await draft(writer);
    const addApproval = writer.writer.addApproval.bind(writer.writer);
    let inserted = false;
    writer.writer.addApproval = async (row) => {
      if (!inserted) {
        inserted = true;
        expect(
          await writer.writer.addRevision({
            id: crypto.randomUUID(),
            generationId: result.generation.id,
            parentId: row.parentId,
            provenance: 'OWNER_EDITED',
            text: 'Новая версия владельца',
            editRatio: null,
            createdAt: fakeClock().now()
          })
        ).toBe(true);
      }
      return addApproval(row);
    };
    const approval = await approveDraft(writer, result.generation.id);
    expect(approval.revision.text).toBe('Новая версия владельца');
    expect((await publishableText(writer, result.generation.id)).text).toBe('Новая версия владельца');
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

  it('records a reason once per draft on the text the owner judged, and counts reasons for «Качество»', async () => {
    const writer = deps(answering(ANSWER));
    const result = await draft(writer);
    const revision = (await writer.writer.revisions(result.generation.id)).at(-1)?.id;
    await recordFeedback(writer, result.generation.id, 'weak_hook');
    await recordFeedback(writer, result.generation.id, 'weak_hook');
    await recordFeedback(writer, result.generation.id, 'joke_missed');
    const rows = await testDb()
      .prepare('SELECT kind, revision_id AS revisionId FROM ai_feedback ORDER BY kind')
      .all<{ kind: string; revisionId: string | null }>();
    expect(rows.results).toEqual([
      { kind: 'joke_missed', revisionId: revision },
      { kind: 'weak_hook', revisionId: revision }
    ]);
    const quality = await writer.writer.quality(0);
    expect(quality.jokeMissed).toBe(1);
    expect(quality.feedback).toEqual([
      { kind: 'joke_missed', count: 1 },
      { kind: 'weak_hook', count: 1 }
    ]);
  });

  it('migration 0067 keeps every earlier verdict and accepts only the known reasons', async () => {
    const writer = deps(answering(ANSWER));
    const result = await draft(writer);
    const migration = env.TEST_MIGRATIONS.find(({ name }) => name === '0067_ai_feedback_reasons.sql');
    expect(migration).toBeDefined();
    // The table as migration 0054 made it, with a verdict in it.
    await testDb().batch([
      testDb().prepare('DROP TABLE ai_feedback'),
      testDb().prepare(
        `CREATE TABLE ai_feedback (
           id TEXT PRIMARY KEY CHECK (length(id) = 36),
           generation_id TEXT NOT NULL REFERENCES ai_generations (id),
           kind TEXT NOT NULL CHECK (kind IN ('joke_missed', 'not_my_style', 'fact_wrong')),
           created_at INTEGER NOT NULL,
           UNIQUE (generation_id, kind)
         )`
      ),
      testDb()
        .prepare("INSERT INTO ai_feedback (id, generation_id, kind, created_at) VALUES (?, ?, 'not_my_style', 5)")
        .bind('00000000-0000-4000-8000-0000000000f1', result.generation.id),
      testDb().prepare('DELETE FROM d1_migrations WHERE name = ?1').bind(migration?.name)
    ]);
    await applyD1Migrations(testDb(), migration === undefined ? [] : [migration]);

    const kept = await testDb()
      .prepare('SELECT id, kind, revision_id AS revisionId, created_at AS createdAt FROM ai_feedback')
      .all();
    expect(kept.results).toEqual([
      { id: '00000000-0000-4000-8000-0000000000f1', kind: 'not_my_style', revisionId: null, createdAt: 5 }
    ]);
    await recordFeedback(writer, result.generation.id, 'missed_task');
    await expect(
      testDb()
        .prepare("INSERT INTO ai_feedback (id, generation_id, kind, created_at) VALUES (?, ?, 'meh', 6)")
        .bind('00000000-0000-4000-8000-0000000000f2', result.generation.id)
        .run()
    ).rejects.toThrow();
  });

  it('ranks the owner texts by the task first and by recency only among equals', () => {
    const newestFirst = ['Лион: кому отдать палец.', 'Пудж: хуки мимо.', 'Варды на изи-лайне решают игру.'];
    // The oldest text shares the task's stem («вард»): it wins over two fresher ones.
    expect(rankOwnerTexts('как я учусь вардить', newestFirst, 2)).toEqual([
      'Варды на изи-лайне решают игру.',
      'Лион: кому отдать палец.'
    ]);
    // Nothing in common (or no task words): the newest first, as before.
    expect(rankOwnerTexts('придумай сам', newestFirst, 2)).toEqual(newestFirst.slice(0, 2));
    expect(rankOwnerTexts('', newestFirst, 5)).toEqual(newestFirst);
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

  it('stores a request for facts as needs_facts, never as a draft, and refuses to edit, approve or publish it', async () => {
    const writer = deps(
      answering(
        writerAnswer({
          kind: 'ideas',
          question: 'По какой расскажешь и что было в игре?',
          ideas: ['Первый Пудж: хуки мимо', 'Лион: кому палец', 'Варды, которые никто не видел']
        })
      )
    );
    const result = await draft(writer, 'придумай сам тему для «Учусь играть»');
    expect(result.text).toBeNull();
    expect(result.generation).toMatchObject({
      status: 'ready',
      result: 'needs_facts',
      question: 'По какой расскажешь и что было в игре?',
      ideas: ['Первый Пудж: хуки мимо', 'Лион: кому палец', 'Варды, которые никто не видел']
    });
    // No AI_DRAFT: nothing to check, approve or learn from.
    expect(await writer.writer.revisions(result.generation.id)).toEqual([]);
    const notADraft = { code: 'CONFLICT', details: { reason: 'NOT_A_DRAFT' } };
    await expect(approveDraft(writer, result.generation.id)).rejects.toMatchObject(notADraft);
    await expect(saveOwnerEdit(writer, result.generation.id, 'мой текст')).rejects.toMatchObject(notADraft);
    await expect(publishableText(writer, result.generation.id)).rejects.toMatchObject(notADraft);
    // The paid call is in the ledger like any other.
    const usage = await testDb()
      .prepare('SELECT COUNT(*) AS n FROM ai_generations g JOIN ai_usage u ON u.id = g.usage_id WHERE g.id = ?')
      .bind(result.generation.id)
      .first<{ n: number }>();
    expect(usage?.n).toBe(1);

    // «Качество»: the question is not a draft, so it never inflates «approved of drafts»; a row from before
    // migration 0062 (no result) is a draft, as the writer could only answer with one then.
    await draft(deps(answering(ANSWER)));
    await testDb()
      .prepare(
        `INSERT INTO ai_generations (id, kind, format, mode, source, task, status, pack_revision, created_at, updated_at)
         VALUES ('00000000-0000-4000-8000-0000000000e1', 'draft', 'igrat', 'direct', 'bot', 'задание', 'ready', 'pack', 1, 1)`
      )
      .run();
    const quality = await writer.writer.quality(0);
    expect(quality).toMatchObject({ drafts: 2, questions: 1 });
  });

  it('refuses to approve an older question stored as AI_DRAFT with its NEEDS_FACTS warning', async () => {
    const writer = deps(answering(ANSWER));
    const old = await draft(writer);
    await testDb()
      .prepare(`UPDATE ai_generations SET warnings = '["NEEDS_FACTS"]', result = NULL WHERE id = ?`)
      .bind(old.generation.id)
      .run();
    await expect(approveDraft(writer, old.generation.id)).rejects.toMatchObject({ details: { reason: 'NOT_A_DRAFT' } });
  });

  it('fails an answer of the wrong shape with AI_BAD_FORMAT instead of guessing a draft', async () => {
    const writer = deps(answering('ХУКИ:\n- старый формат\nТЕКСТ:\nтекст'));
    const result = await draft(writer);
    expect(result).toMatchObject({ text: null, generation: { status: 'failed', errorCode: 'AI_BAD_FORMAT' } });
    expect(await writer.writer.revisions(result.generation.id)).toEqual([]);
  });

  it('asks for structured output, lists recent topics and flags a repeated one', async () => {
    const requests: Parameters<AiTextProvider['complete']>[0][] = [];
    const writer = deps({
      provider: 'openai',
      complete: (request) => {
        requests.push(request);
        return answering(ANSWER).complete(request);
      }
    });
    const first = await draft(writer, 'придумай сам тему');
    expect(requests[0]?.jsonSchema?.name).toBe('writer_answer');
    expect(requests[0]?.input).toContain('ЗАПРОС: тема на твой выбор');
    expect(first.generation.warnings).not.toContain('TOPIC_REPEATED');

    const second = await draft(writer, 'придумай сам тему');
    expect(requests[1]?.input).toContain('НЕДАВНИЕ');
    expect(requests[1]?.input).toContain('апнул 3к и понял про варды · признание новичка · призыв подписаться');
    // The same topic again: flagged by code, no extra model call.
    expect(second.generation.warnings).toContain('TOPIC_REPEATED');
    expect(requests).toHaveLength(2);
    // A concrete topic is not a request to invent one, and the topic the owner names is never flagged a repeat.
    const named = await draft(writer, 'как я апнул 3к на Лионе');
    expect(requests[2]?.input).not.toContain('ЗАПРОС: тема на твой выбор');
    expect(named.generation.warnings).not.toContain('TOPIC_REPEATED');

    // Recent ideas of every format: a Reels prompt sees what the posts were about.
    await generateDraft(writer, {
      format: 'standalone',
      mode: 'direct',
      source: 'bot',
      task: 'придумай сам',
      signal: AbortSignal.timeout(1000)
    });
    expect(requests[3]?.input).toContain('Учусь играть: апнул 3к и понял про варды');
  });

  it('rests a signature phrase that came in two of the latest drafts (frequency, not a ban)', async () => {
    expect(overusedPhrases(['мой тупой мозг не понял', 'и тут мой тупой мозг', 'Запомни: керри'])).toEqual([
      'мой тупой мозг'
    ]);
    const writer = deps(
      answering(writerAnswer({ text: 'Мой тупой мозг опять не понял, куда идти. Я учусь.', topic: 'куда идти' }))
    );
    const requests: string[] = [];
    const recording: AiTextProvider = {
      provider: 'openai',
      complete: (request) => {
        requests.push(request.input);
        return answering(writerAnswer({ text: 'Мой тупой мозг снова.', topic: 'ещё' })).complete(request);
      }
    };
    await draft(writer);
    await draft(writer);
    await draft({ ...writer, provider: recording });
    expect(requests[0]).toContain('СЕЙЧАС БЕЗ: «мой тупой мозг»');
  });

  it('flags a doubled word and a patch change the task never mentioned', () => {
    expect(checkDraft('telegram', 'direct', 'Я что что нажал?')).toContain('DOUBLED_WORD');
    expect(checkDraft('telegram', 'direct', 'Я нажал что-то не то.')).not.toContain('DOUBLED_WORD');
    expect(checkDraft('standalone', 'direct', 'В новом патче Оракла понерфили.', 'рилс про Оракла')).toContain(
      'PATCH_UNVERIFIED'
    );
    expect(
      checkDraft('standalone', 'direct', 'В новом патче Оракла понерфили.', 'реакция на нерф Оракла в патче')
    ).not.toContain('PATCH_UNVERIFIED');
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
    expect(await repo.touchRequest(1, 2, 2000)).toEqual({
      kind: 'editor',
      history: [],
      format: null,
      editing: null,
      noting: null,
      fixing: null
    });
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
      format: null,
      editing: null,
      noting: null,
      fixing: null
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
    // Owner, 16.10.2026: «почему он постоянно говорит мужчина» — any address is flagged, not only a repeat.
    expect(checkDraft('telegram', 'direct', 'Мужики, дайте разобраться, кого я лечу.')).toContain('ADDRESS_USED');
    expect(checkDraft('telegram', 'direct', 'Мужчины, стрим в 20:00.')).toContain('ADDRESS_USED');
    expect(checkDraft('telegram', 'direct', 'Стрим в 20:00, заходите.')).not.toContain('ADDRESS_USED');
  });

  it('sends the author state as background, not as experience to write about (owner, 16.10.2026)', () => {
    // «В турбо потеют» got «я кнопки на Оракле читаю»: the state's heroes were taken as the post's experience.
    const prompt = buildWriterPrompt({
      format: 'telegram',
      mode: 'direct',
      task: 'в турбо слишком потеют игроки и я не понимаю почему',
      author: authorStateText({
        dotaAccountId: null,
        hours: null,
        learningHeroes: ['Оракл'],
        unknownAspects: '',
        experiments: '',
        notes: '',
        dota: null,
        revision: 0,
        updatedAt: '2026-10-16T00:00:00.000Z'
      })
    });
    expect(prompt.input).toContain('не тема');
    // The seed used without a profile no longer names heroes of past videos.
    const seed = buildWriterPrompt({ format: 'telegram', mode: 'direct', task: 'турбо' });
    expect(seed.input).not.toMatch(/Оракл/);
    expect(seed.input).toContain('не тема');
    // A Telegram post is about anything the owner asks: the Reels rubrics and their experiments stay out.
    expect(seed.input).not.toMatch(/Рубрики:|Текущие эксперименты/);
    const reels = buildWriterPrompt({ format: 'igrat', mode: 'direct', task: 'турбо' });
    expect(reels.input).toMatch(/Текущие эксперименты/);
  });

  it('measures the owner edit', () => {
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

  it('gives «Учусь играть» examples without the opener and «подпишись» (owner, 19.10.2026)', () => {
    const { input } = buildWriterPrompt({
      format: 'igrat',
      mode: 'direct',
      task: 'Учусь играть на Пудже',
      ownerTexts: ['Учусь играть в Доту! Пудж ловит крипов. А ты подпишись уже, заебал.']
    });
    expect(input).toContain('одобрен в студии):\nПудж ловит крипов.\n');
    const examples = pickExamples('igrat', 'Учусь играть на Пудже');
    expect(examples.length).toBeGreaterThan(0);
    const medal = /(бронзов|серебрян|золот|алмазн)\S*\s+габен/i;
    for (const example of examples) {
      expect(example).not.toMatch(/учусь играть в доту|подпишись/i);
      expect(example).not.toMatch(medal);
    }
    // The medal is cut from Telegram examples too: the author gives it himself (owner, 19.10.2026).
    const reviews = pickExamples('telegram', 'обзор героя Шейкер');
    expect(reviews.length).toBeGreaterThan(0);
    for (const example of reviews) expect(example).not.toMatch(medal);
  });

  it('reads a writing request in plain words and leaves other text a plain draft', () => {
    expect(writerIntent('напиши пост в тг про новый патч')).toMatchObject({ format: 'telegram' });
    expect(writerIntent('Сделай рилс учусь играть про варды')).toMatchObject({ format: 'igrat' });
    expect(writerIntent('придумай сценарий учу фидить на пуджа')).toMatchObject({ format: 'fidit' });
    // A rubric name at the start is the task itself (owner DEV run 19.10.2026: it became a plain chat answer).
    expect(writerIntent('«Учусь играть на Пудже')).toMatchObject({ format: 'igrat', task: '«Учусь играть на Пудже' });
    expect(writerIntent('Учу фидить на Пудже')).toMatchObject({ format: 'fidit' });
    expect(writerIntent('Я учусь играть на Пудже')).toBeNull();
    expect(writerIntent('Сегодня стрим в 20:00')).toBeNull();
    expect(writerIntent('напиши мне потом')).toBeNull();
  });
});
