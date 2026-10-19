import type { CreatePostInput } from '@alexeev/contracts';
import { type Api, type Bot, type Context, GrammyError, InlineKeyboard } from 'grammy';
import type { InlineKeyboardMarkup } from 'grammy/types';
import {
  approveDraft,
  askEditor,
  approvedRevision,
  attachPost,
  chooseHook,
  describeCheck,
  type FeedbackKind,
  FORMAT_LABEL,
  type GenerationRow,
  generateDraft,
  NEEDS_FACTS,
  publishableText,
  recordFeedback,
  rewriteDraft,
  saveFeedbackNote,
  feedbackNoteOf,
  saveOwnerEdit,
  type ChatTurn,
  type WriterDeps,
  type WriterFormat,
  type WriterResult
} from '../../modules/ai';
import { AppError } from '../../shared/app-error';
import { formatAiBudgetAlert } from '../notifications/ai-budget-alert';
import type { Clock } from '../../platform/clock';
import type { PublishActions } from './publish-actions';
import type { AiJob, AiJobBase, WriterJob } from './ai-job';
import { draftFromMessageText } from './draft-from-message';
import { publishKeyboard } from './publish-keyboard';

// The AI writer in the owner's chat (docs/backend/bot.md «AI writer»): a request in plain words or a command
// becomes a draft; buttons rewrite, pick a hook, give feedback or approve; a reply with text is the owner's
// edit. Only an approved Telegram text becomes a studio post, through the usual draft and publish flow.

/**
 * A queued job has 15 minutes of wall time; a reasoning model at its default effort took over 25 s on DEV
 * (owner run 19.10.2026), so it gets two minutes and is never asked to think less.
 */
const MODEL_TIMEOUT_MS = 120_000;
/** A message is at most 4096 characters; the rest stays in the draft. */
const SHOWN_TEXT_MAX = 3300;

const WRITING_TEXT = 'Пишу…';
const REWRITING_TEXT = 'Переписываю…';
const THINKING_TEXT = 'Думаю…';
const FAILED_TEXT = 'Не получилось написать. Попробуйте ещё раз.';
// Only an owner-changed text teaches the voice (plan 3.1): an unchanged AI text is just saved.
const APPROVED_REEL_TEXT = 'Одобрено. Текст сохранён.';
const APPROVED_EDITED_REEL_TEXT = 'Одобрено. Текст сохранён, ваши правки ИИ запомнит.';
const ALREADY_APPROVED_TEXT = 'Уже одобрено.';
const NOT_A_POST_TEXT =
  'Текст не влезает в пост (длиннее 4096 символов или с недопустимыми символами). Нажмите «Короче» или ответьте своей версией.';
const EDIT_SAVED_TEXT = 'Сохранил вашу версию. Одобрить её?';
const EDIT_CANCELLED_TEXT = 'Правка отменена';
const NOTE_PROMPT_TEXT =
  'Поясните одним сообщением (до 500 знаков), что не так, — исправлю текст. Правилом для других текстов это не станет. «Без пояснения» — только записать причину.';
const FIX_PROMPT_TEXT =
  'Напишите своими словами, что не так (до 500 знаков), — исправлю эту версию. Или выберите причину кнопкой.';
const REMARK_TOO_LONG_TEXT = 'Замечание — от 1 до 500 знаков, без служебных символов. Пришлите короче.';
const REMARK_TAKEN_TEXT = 'Замечание уже принято, исправляю.';
const NO_PREVIOUS_TEXT = 'Прошлой версии нет.';
const NOTE_SAVED_TEXT = 'Записал пояснение.';
const NOTE_INVALID_TEXT =
  'Пояснение — от 1 до 500 знаков, без служебных символов. Пришлите короче или нажмите «Без пояснения».';
const NOTE_GONE_TEXT = 'Этот вердикт уже снят, пояснение не записал.';
const NOTE_SKIPPED_TEXT = 'Хорошо, без пояснения';
const NO_NOTE = /^ai:nonote:([0-9a-f-]{36})$/;
/** The text shown to copy from in «✏️ Изменить»: a Telegram message holds 4096 characters. */
const EDIT_SHOWN_MAX = 3500;
const editPromptHtml = (text: string) =>
  [
    '<b>✏️ Пришлите свою версию следующим сообщением</b> — сохраню как правку. Отвечать на сообщение не нужно.',
    '',
    'Текст сейчас (можно скопировать):',
    // Cut by code points: a cut through an emoji's surrogate pair makes Telegram refuse the message.
    `<blockquote expandable>${escapeHtml(Array.from(text).length > EDIT_SHOWN_MAX ? `${Array.from(text).slice(0, EDIT_SHOWN_MAX).join('')}…` : text)}</blockquote>`
  ].join('\n');

/** A /redactor or /post mode ends after this long without a message. */
export const REQUEST_TTL_MS = 30 * 60 * 1000;
/** Turns of the conversation the editor sees, and the length of each. */
const HISTORY_TURNS = 8;
const TURN_MAX = 1200;
const END_CHAT = 'rd:end';
/** Format buttons under /redactor (owner, 16.10.2026: a Telegram post and the two rubrics, no plain Reel). */
const FORMAT_BUTTONS: readonly [WriterFormat, string][] = [
  ['telegram', 'Пост в ТГ'],
  ['fidit', 'Учу фидить'],
  ['igrat', 'Учусь играть']
];
const FORMAT_CALLBACK = /^rd:(telegram|fidit|igrat)$/;
const ASK_TOPIC_TEXT =
  'Редактор на связи. Пишите, что нужно: пост, рилс, идею или вопрос. Чат идёт, пока не нажмёте «Закончить» (или 30 минут тишины).';
const CHAT_ENDED_TEXT = 'Готово, режим закончен.';
/** Outside /post and /redactor a plain message is not a post (owner, 16.10.2026). */
export const NO_MODE_TEXT = 'Чтобы сделать пост — /post, чтобы написать с ИИ — /redactor.';
const POST_MODE_TEXT =
  'Режим постов: каждое сообщение, фото или альбом станет черновиком. Нажмите «Закончить», когда хватит (или 30 минут тишины).';

const REWRITES = {
  more: 'другой вариант: другой заход, другие шутки, тот же смысл',
  short: 'короче примерно на треть, без потери главного',
  fun: 'смешнее: больше живых шуток и мемов автора, без кринжа'
} as const;
/** «Что не так?»: the reasons of the plan's stage 2, each recorded once per draft and only recorded. */
const REASONS = {
  topic: { kind: 'topic_repeated', label: 'Тема повторяется', noted: 'тема повторяется' },
  hook: { kind: 'weak_hook', label: 'Слабый хук', noted: 'слабый хук' },
  joke: { kind: 'joke_missed', label: 'Шутка не зашла', noted: 'шутка не зашла' },
  style: { kind: 'not_my_style', label: 'Не мой стиль', noted: 'не мой стиль' },
  long: { kind: 'too_long', label: 'Слишком длинно', noted: 'слишком длинно' },
  fact: { kind: 'fact_wrong', label: 'Ошибка в фактах', noted: 'ошибка в фактах' },
  task: { kind: 'missed_task', label: 'Не то задание', noted: 'не то задание' }
} as const satisfies Record<string, { kind: FeedbackKind; label: string; noted: string }>;
type Reason = keyof typeof REASONS;
/** A reason in the owner's words by its stored kind: the label a fix prompt and a reply show. */
const REASON_NOTED = Object.fromEntries(Object.values(REASONS).map((reason) => [reason.kind, reason.noted])) as Record<
  FeedbackKind,
  string
>;
// `joke` stays for the buttons of messages sent before «Что не так?».
type Action =
  | 'h0'
  | 'h1'
  | 'h2'
  | keyof typeof REWRITES
  | 'joke'
  | 'ok'
  | 'why'
  | 'back'
  | 'edit'
  | 'noedit'
  | 'retry'
  | 'undo'
  | `r:${Reason}`;
const CALLBACK =
  /^ai:([0-9a-f-]{36}):(h[0-2]|more|short|fun|joke|ok|why|back|edit|noedit|retry|undo|r:(?:topic|hook|joke|style|long|fact|task))(?::([0-9a-f]{12}))?$/;

const escapeHtml = (value: string): string =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

/** Telegram counts UTF-16 positions; never end a shortened message on half of an emoji. */
const shortenForTelegram = (value: string, max: number): string =>
  value.length > max ? `${value.slice(0, max).replace(/[\uD800-\uDBFF]$/, '')}…` : value;

/**
 * A request for a text in plain words: «напиши пост в тг про …», «сделай рилс учусь играть про …». Anything
 * else stays an ordinary draft, as before. Returns the format and the task (the whole message).
 */
export function writerIntent(text: string): { format: WriterFormat; task: string } | null {
  const lower = text.toLowerCase();
  // A message that opens with a rubric name is its task (plan 3.1: «Учусь играть про Пуджа: …»), quotes aside.
  const rubric = /^[\s«"„“]*(учусь играть|уч(у|им) фид)/.exec(lower);
  if (rubric !== null) return { format: rubric[1] === 'учусь играть' ? 'igrat' : 'fidit', task: text.trim() };
  if (!/^\s*(напиши|сделай|придумай|накидай|набросай)\s/.test(lower)) return null;
  const head = lower.slice(0, 120);
  const format: WriterFormat | null = /уч(у|им) фид/.test(head)
    ? 'fidit'
    : /учусь играть/.test(head)
      ? 'igrat'
      : /(рилс|ролик|сценари|шортс|видео)/.test(head)
        ? 'standalone'
        : /(пост|тг|телег)/.test(head)
          ? 'telegram'
          : null;
  return format === null ? null : { format, task: text.trim() };
}

function keyboard(
  generationId: string,
  hooks: readonly string[],
  appOrigin: string | null,
  revisionId: string,
  /** A version fixed by the owner's remark: «↩ Вернуть прошлый» shows the version it came from again. */
  undo = false
): InlineKeyboardMarkup {
  const data = (action: Action) => `ai:${generationId}:${action}`;
  const revisionData = (action: Action) => `${data(action)}:${revisionId.slice(-12)}`;
  const board = new InlineKeyboard();
  hooks.forEach((_hook, index) => board.text(`Хук ${index + 1}`, revisionData(`h${index}` as Action)));
  if (hooks.length > 0) board.row();
  board
    .text('Ещё вариант', revisionData('more'))
    .text('Короче', revisionData('short'))
    .text('Смешнее', revisionData('fun'))
    .row();
  board.text('✏️ Изменить', data('edit')).text('Что не так?', revisionData('why')).row();
  board.text('Одобрить', data('ok'));
  if (undo) board.text('↩ Вернуть прошлый', data('undo'));
  if (appOrigin !== null) board.row().webApp('Открыть студию', `${appOrigin}/`);
  return board;
}

/** The reasons, two per row, and the way back to the draft's buttons. */
function reasonsKeyboard(generationId: string, revisionId: string): InlineKeyboardMarkup {
  const board = new InlineKeyboard();
  (Object.keys(REASONS) as Reason[]).forEach((reason, index) => {
    board.text(REASONS[reason].label, `ai:${generationId}:r:${reason}:${revisionId.slice(-12)}`);
    if (index % 2 === 1) board.row();
  });
  return board.text('← Назад', `ai:${generationId}:back:${revisionId.slice(-12)}`);
}

/** The model asked for the owner's facts (result needs_facts, or the NEEDS_FACTS warning of an older row). */
function isRequestForFacts(generation: Pick<GenerationRow, 'result' | 'warnings'>): boolean {
  return generation.result === 'needs_facts' || generation.warnings.includes(NEEDS_FACTS);
}

/** What the answer to a facts question becomes: a post is a post, not a script (owner DEV run 19.10.2026). */
const writesWhat = (format: WriterFormat) => (format === 'telegram' ? 'пост' : 'сценарий');

function factsHtml(generation: Pick<GenerationRow, 'format' | 'question' | 'ideas'>): string {
  const lines = [`<b>${FORMAT_LABEL[generation.format]}: нужны ваши детали</b>`, ''];
  if (generation.ideas.length > 0)
    lines.push('Идеи:', ...generation.ideas.map((idea, index) => `${index + 1}. ${escapeHtml(idea)}`), '');
  lines.push(
    escapeHtml(generation.question ?? 'Что было в игре?'),
    '',
    generation.ideas.length > 0
      ? `<i>Напишите следующим сообщением номер идеи и что у вас было — напишу ${writesWhat(generation.format)} по вашему опыту.</i>`
      : `<i>Напишите следующим сообщением, что у вас было, — напишу ${writesWhat(generation.format)} по вашему опыту.</i>`
  );
  return lines.join('\n');
}

function draftHtml(result: {
  format: WriterFormat;
  hooks: readonly string[];
  warnings: readonly string[];
  text: string;
  /** A version fixed by the owner's remark: what changed, in the model's one line. */
  changes?: string;
}) {
  if (result.warnings.includes(NEEDS_FACTS))
    return [
      `<b>${FORMAT_LABEL[result.format]}: нужны ваши детали</b>`,
      '',
      escapeHtml(result.text),
      '',
      `<i>Напишите следующим сообщением, что у вас было, — напишу ${writesWhat(result.format)} по вашему опыту.</i>`
    ].join('\n');
  const lines = [`<b>${FORMAT_LABEL[result.format]}</b>`];
  if (result.hooks.length > 0)
    lines.push('', 'Хуки:', ...result.hooks.map((hook, index) => `${index + 1}. ${escapeHtml(hook)}`));
  const text = shortenForTelegram(result.text, SHOWN_TEXT_MAX);
  lines.push('', escapeHtml(text));
  if (result.changes) lines.push('', `<i>Что изменил: ${escapeHtml(result.changes)}</i>`);
  if (result.warnings.length > 0)
    lines.push('', `<i>Проверка: ${escapeHtml(result.warnings.map(describeCheck).join('; '))}</i>`);
  lines.push('', '<i>Своя версия — кнопка «✏️ Изменить».</i>');
  return lines.join('\n');
}

/** A failed generation says why (plan 3.2: an OpenAI failure is shown honestly), with its stored code. */
const FAILURE_REASON: Record<string, string> = {
  AI_TIMEOUT: 'модель не ответила за 25 секунд',
  AI_PROVIDER_UNREACHABLE: 'OpenAI недоступен',
  AI_RATE_OR_QUOTA: 'OpenAI: лимит запросов или квота аккаунта',
  AI_KEY_REJECTED: 'OpenAI отклонил ключ',
  AI_MODEL_NOT_FOUND: 'OpenAI не нашёл модель из «Настройки → ИИ»',
  AI_BAD_REQUEST: 'OpenAI отклонил запрос',
  AI_BAD_FORMAT: 'модель ответила не в том формате',
  AI_RESPONSE_SHAPE: 'модель ответила не в том формате'
};

function failedText(errorCode: string | null): string {
  if (errorCode === null) return FAILED_TEXT;
  const reason = FAILURE_REASON[errorCode];
  return `Не получилось написать${reason === undefined ? '' : `: ${reason}`} (${errorCode}). Попробуйте ещё раз.`;
}

function unavailableText(error: AppError): string {
  const reason = error.details?.reason;
  if (reason === 'DISABLED') return 'ИИ выключен. Включите его в «Настройки → ИИ».';
  if (reason === 'NO_KEY') return 'Ключ ИИ не задан.';
  if (reason === 'NO_MODEL' || reason === 'NO_PRICE')
    return 'Не выбрана модель или у неё нет цены. Проверьте «Настройки → ИИ».';
  if (reason === 'BUDGET') return 'Бюджет ИИ на сегодня или месяц исчерпан.';
  return FAILED_TEXT;
}

async function edit(api: Api, chatId: number, messageId: number, html: string, markup?: InlineKeyboardMarkup) {
  try {
    await api.editMessageText(chatId, messageId, html, {
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
      ...(markup === undefined ? {} : { reply_markup: markup })
    });
  } catch (error) {
    if (!(error instanceof GrammyError && error.description.includes('message is not modified'))) throw error;
  }
}

/** Replaces the message's buttons; a double tap asks for the same buttons again, which Telegram calls an error. */
async function swapButtons(ctx: Context, markup: InlineKeyboardMarkup): Promise<void> {
  try {
    await ctx.editMessageReplyMarkup({ reply_markup: markup });
  } catch (error) {
    if (!(error instanceof GrammyError && error.description.includes('message is not modified'))) throw error;
  }
}

/** The part of the bot runtime the writer uses (create-bot's `BotRuntime` provides it). */
export interface AiWriterRuntime {
  appOrigin: string;
  clock: Clock;
  writer: () => Promise<WriterDeps>;
  createDraft: (input: CreatePostInput, idempotencyKey: string) => Promise<{ id: string; revision: number }>;
  publish: Pick<PublishActions, 'buttons' | 'awaitingTime' | 'stopAwaitingTime'>;
  /** Sends a model call to the AI_JOBS queue (app/ai-queue.ts runs it). Throws when the queue refuses it. */
  enqueueAiJob: (job: AiJob) => Promise<void>;
  onError: (error: unknown) => void;
}

/** What a queued AI job needs (app/ai-queue.ts builds it for each message). */
export interface AiJobRuntime {
  api: Api;
  clock: Clock;
  /** Claims the job once in D1; false for a redelivered message, whose first delivery owns the chat message. */
  claim: () => Promise<boolean>;
  writer: () => Promise<WriterDeps>;
  onError: (error: unknown) => void;
}

const retryKeyboard = (generationId: string) =>
  new InlineKeyboard().text('Повторить по сохранённому ответу', `ai:${generationId}:retry`);

const endKeyboard = () => new InlineKeyboard().text('Закончить', END_CHAT);

function failureOf(error: unknown, runtime: AiJobRuntime): string {
  const unavailable = error instanceof AppError && error.code === 'UNAVAILABLE';
  if (!unavailable) runtime.onError(error);
  return unavailable ? unavailableText(error) : FAILED_TEXT;
}

async function jobResult(
  job: Exclude<WriterJob, { kind: 'chat' }>,
  deps: WriterDeps,
  runtime: AiJobRuntime
): Promise<WriterResult> {
  const signal = AbortSignal.timeout(MODEL_TIMEOUT_MS);
  if (job.kind === 'draft')
    return generateDraft(deps, { format: job.format, mode: 'direct', source: 'bot', task: job.task, signal });
  if (job.kind === 'fix')
    return rewriteDraft(deps, {
      generationId: job.generationId,
      instruction: 'исправить по замечанию автора',
      revisionToken: job.revisionToken,
      remark: { note: job.note, reason: job.reason === null ? null : REASON_NOTED[job.reason] },
      signal
    });
  if (job.kind === 'rewrite')
    return rewriteDraft(deps, {
      generationId: job.generationId,
      instruction: REWRITES[job.action],
      revisionToken: job.revisionToken,
      signal
    });
  try {
    const question = await deps.writer.findGeneration(job.generationId);
    if (question === null) throw new AppError('NOT_FOUND', 'The question is gone');
    const result = await generateDraft(deps, {
      format: question.format,
      mode: question.mode,
      source: 'bot',
      task: job.task,
      parentGenerationId: question.id,
      signal
    });
    await deps.writer.finishFactAnswer({
      generationId: job.generationId,
      draftGenerationId: result.generation.id,
      status: result.generation.status === 'failed' ? 'failed' : 'ready',
      now: runtime.clock.now()
    });
    return result;
  } catch (error) {
    await deps.writer.finishFactAnswer({
      generationId: job.generationId,
      draftGenerationId: null,
      status: 'failed',
      now: runtime.clock.now()
    });
    throw error;
  }
}

/** A free message in a /redactor chat: one answer in the author's voice, kept in the chat's history. */
async function runChatJob(
  job: Extract<AiJob, { kind: 'chat' }>,
  deps: WriterDeps,
  runtime: AiJobRuntime
): Promise<void> {
  const { api } = runtime;
  const { chatId, messageId, history } = job;
  try {
    const answer = await askEditor(deps, {
      task: job.text,
      history: history ?? [],
      signal: AbortSignal.timeout(MODEL_TIMEOUT_MS)
    });
    for (const event of answer.budgetEvents)
      await api.sendMessage(chatId, formatAiBudgetAlert(event), { parse_mode: 'HTML' });
    const shown = answer.text === null ? FAILED_TEXT : escapeHtml(shortenForTelegram(answer.text, 4000));
    await edit(api, chatId, messageId, shown, history === null ? undefined : endKeyboard());
    if (history !== null && answer.text !== null)
      await deps.writer.saveHistory(
        chatId,
        [
          ...history,
          { role: 'owner' as const, text: job.text.slice(0, TURN_MAX) },
          { role: 'editor' as const, text: answer.text.slice(0, TURN_MAX) }
        ].slice(-HISTORY_TURNS)
      );
  } catch (error) {
    await edit(api, chatId, messageId, failureOf(error, runtime)).catch((editError: unknown) =>
      runtime.onError(editError)
    );
  }
}

/**
 * A remark written without a reason button is recorded with the first reason the model named, on the version it
 * judged; only recorded, never a rule (plan §3.1). A failure here is logged: the fixed text is already shown.
 */
async function recordRemark(
  job: Extract<AiJob, { kind: 'fix' }>,
  result: WriterResult,
  deps: WriterDeps,
  runtime: AiJobRuntime
): Promise<void> {
  const kind = result.fix?.reasons[0];
  if (job.feedbackId !== null || kind === undefined) return;
  try {
    const feedbackId = await recordFeedback(deps, job.generationId, kind, job.revisionToken);
    await saveFeedbackNote(deps, feedbackId, job.note);
  } catch (error) {
    runtime.onError(error);
  }
}

/**
 * Runs one queued model call and turns its «Пишу…» message into the draft, the facts question or the reason
 * it failed. Never throws: every failure is shown in that message (and logged unless it is AI being off).
 */
export async function runAiJob(job: WriterJob, runtime: AiJobRuntime): Promise<void> {
  const { api, clock } = runtime;
  const { chatId, messageId } = job;
  const failureMarkup = job.kind === 'facts' ? retryKeyboard(job.generationId) : undefined;
  let deps: WriterDeps;
  try {
    if (!(await runtime.claim())) return;
    deps = await runtime.writer();
  } catch (error) {
    // D1 failed before the model: the message still says so instead of «Пишу…» forever.
    await edit(api, chatId, messageId, failureOf(error, runtime), failureMarkup).catch((editError: unknown) =>
      runtime.onError(editError)
    );
    return;
  }
  if (job.kind === 'chat') {
    await runChatJob(job, deps, runtime);
    return;
  }
  try {
    const result = await jobResult(job, deps, runtime);
    for (const event of result.budgetEvents)
      await api.sendMessage(chatId, formatAiBudgetAlert(event), { parse_mode: 'HTML' });
    const { generation } = result;
    if (isRequestForFacts(generation)) {
      // A question has nothing to approve or rewrite: no keyboard; the owner's reply continues it.
      await deps.writer.setChatMessage(generation.id, messageId, clock.now());
      // The next plain message answers it (owner, 17.10.2026: replying to a message is awkward).
      const now = clock.now();
      await deps.writer.setEditing({ chatId, generationId: generation.id, now, expiresAt: now + REQUEST_TTL_MS });
      await edit(api, chatId, messageId, factsHtml(generation));
      return;
    }
    if (result.text === null) {
      await edit(api, chatId, messageId, failedText(generation.errorCode), failureMarkup);
      return;
    }
    await deps.writer.setChatMessage(generation.id, messageId, clock.now());
    const revisionId = (await deps.writer.revisions(generation.id)).at(-1)?.id;
    if (revisionId === undefined) throw new AppError('CONFLICT', 'The draft has no text');
    const fixed = job.kind === 'fix';
    await edit(
      api,
      chatId,
      messageId,
      draftHtml({ ...generation, text: result.text, ...(fixed && result.fix ? { changes: result.fix.changes } : {}) }),
      keyboard(generation.id, generation.hooks, job.appOrigin, revisionId, fixed)
    );
    if (fixed) await recordRemark(job, result, deps, runtime);
  } catch (error) {
    await edit(api, chatId, messageId, failureOf(error, runtime), failureMarkup).catch((editError: unknown) =>
      runtime.onError(editError)
    );
  }
}

export function registerAiWriter(bot: Bot, runtime: AiWriterRuntime): void {
  // Answers «Пишу…» at once and queues the model call; the consumer turns that message into the result.
  // False when the queue refused the job: that message then says so.
  async function enqueue(
    ctx: Context,
    placeholder: string,
    job: (base: AiJobBase) => AiJob,
    failureMarkup?: InlineKeyboardMarkup
  ): Promise<boolean> {
    const chatId = ctx.chat?.id;
    if (chatId === undefined) return false;
    const message = await ctx.reply(placeholder, failureMarkup === undefined ? {} : { reply_markup: failureMarkup });
    try {
      await runtime.enqueueAiJob(
        job({ id: crypto.randomUUID(), chatId, messageId: message.message_id, appOrigin: runtime.appOrigin })
      );
      return true;
    } catch (error) {
      runtime.onError(error);
      await edit(ctx.api, chatId, message.message_id, FAILED_TEXT, failureMarkup).catch((editError: unknown) =>
        runtime.onError(editError)
      );
      return false;
    }
  }

  const draft = (ctx: Context, format: WriterFormat, task: string) =>
    enqueue(ctx, WRITING_TEXT, (base) => ({ ...base, kind: 'draft', format, task }));

  // /redactor: one command for everything (owner, 16.10.2026: no format buttons). The next text, or the words
  // after the command, is a free request; «придумай рилс …» or «напиши пост …» in it still makes a draft.
  // A free request: «напиши рилс учусь играть про …» still becomes a draft with its buttons; anything else gets
  // one answer in the author's voice.
  // A tap picks the format of the next message; a second tap on the same one clears it.
  const chatKeyboard = (chosen: WriterFormat | null) => {
    const board = new InlineKeyboard();
    for (const [format, label] of FORMAT_BUTTONS) board.text(format === chosen ? `✓ ${label}` : label, `rd:${format}`);
    return board.row().text('Закончить', END_CHAT);
  };

  // A message to the editor: «напиши пост …» / «придумай рилс …» still becomes a draft with its buttons;
  // anything else is answered in the author's voice with the conversation so far (`history` is null outside
  // a /redactor chat).
  async function free(ctx: Context, text: string, history: ChatTurn[] | null) {
    const intent = writerIntent(text);
    if (intent !== null) {
      await draft(ctx, intent.format, intent.task);
      return;
    }
    await enqueue(ctx, THINKING_TEXT, (base) => ({ ...base, kind: 'chat', text, history }));
  }

  bot.command('redactor', async (ctx) => {
    const task = ctx.match.trim();
    const chatId = ctx.chat.id;
    const now = runtime.clock.now();
    const deps = await runtime.writer();
    const message = task === '' ? await ctx.reply(ASK_TOPIC_TEXT, { reply_markup: chatKeyboard(null) }) : null;
    await deps.writer.openRequest({
      chatId,
      promptMessageId: message?.message_id ?? ctx.message?.message_id ?? 0,
      now,
      expiresAt: now + REQUEST_TTL_MS
    });
    if (task !== '') await free(ctx, task, []);
  });

  bot.callbackQuery(FORMAT_CALLBACK, async (ctx) => {
    const chatId = ctx.chat?.id;
    const messageId = ctx.callbackQuery.message?.message_id;
    if (chatId === undefined || messageId === undefined) return;
    const picked = (ctx.match[1] ?? 'telegram') as WriterFormat;
    // The ✓ on the message says what is picked now; tapping it again clears it.
    const current = ctx.callbackQuery.message?.reply_markup?.inline_keyboard
      .flat()
      .some(
        (button) => button.text.startsWith('✓') && 'callback_data' in button && button.callback_data === `rd:${picked}`
      );
    const format = current ? null : picked;
    const open = await (
      await runtime.writer()
    ).writer.setRequestFormat({
      chatId,
      promptMessageId: messageId,
      format,
      now: runtime.clock.now()
    });
    if (!open) {
      await ctx.answerCallbackQuery({ text: 'Чат закончен, отправьте /redactor ещё раз' }).catch(() => undefined);
      return;
    }
    await ctx.answerCallbackQuery(format === null ? {} : { text: 'Следующее сообщение — тема' }).catch(() => undefined);
    await ctx.editMessageReplyMarkup({ reply_markup: chatKeyboard(format) }).catch((error: unknown) => {
      if (!(error instanceof GrammyError && error.description.includes('message is not modified'))) throw error;
    });
  });

  bot.command('post', async (ctx) => {
    const now = runtime.clock.now();
    const message = await ctx.reply(POST_MODE_TEXT, { reply_markup: endKeyboard() });
    await (
      await runtime.writer()
    ).writer.openRequest({
      chatId: ctx.chat.id,
      promptMessageId: message.message_id,
      now,
      expiresAt: now + REQUEST_TTL_MS,
      kind: 'post'
    });
  });

  // /stop: one way out from anywhere, when the «Закончить» button has scrolled away (owner, 19.10.2026). It ends
  // the /redactor or /post mode and every wait of the chat (a facts answer, the owner's version, a note, a time).
  bot.command('stop', async (ctx) => {
    await (await runtime.writer()).writer.closeRequest(ctx.chat.id);
    const timeWait = await runtime.publish.awaitingTime();
    if (timeWait !== null) await runtime.publish.stopAwaitingTime(timeWait);
    await ctx.reply(CHAT_ENDED_TEXT);
  });

  bot.callbackQuery(END_CHAT, async (ctx) => {
    const chatId = ctx.chat?.id;
    if (chatId === undefined) return;
    await (await runtime.writer()).writer.closeRequest(chatId);
    await ctx.answerCallbackQuery().catch((error: unknown) => runtime.onError(error));
    await ctx.editMessageReplyMarkup().catch(() => undefined);
    await ctx.reply(CHAT_ENDED_TEXT);
  });

  /** The owner's words for a draft: the answer to its question, or the owner's own version of its text. */
  function factsTask(generation: GenerationRow, answer: string): string | null {
    const facts = `\n\nОпыт автора (его слова):\n${answer}`;
    const essential = `${generation.task}${facts}`;
    if (essential.length > 4000) return null;
    const ideas =
      generation.ideas.length > 0
        ? `\n\nИдеи редактора:\n${generation.ideas.map((idea, index) => `${index + 1}. ${idea}`).join('\n')}`
        : '';
    return ideas.length + essential.length <= 4000 ? `${generation.task}${ideas}${facts}` : essential;
  }

  async function writeFactDraft(ctx: Context, generation: GenerationRow, task: string) {
    const queued = await enqueue(
      ctx,
      WRITING_TEXT,
      (base) => ({ ...base, kind: 'facts', generationId: generation.id, task }),
      retryKeyboard(generation.id)
    );
    // Not queued: the saved answer is free for the retry button at once, not after the processing lease.
    if (!queued)
      await (
        await runtime.writer()
      ).writer.finishFactAnswer({
        generationId: generation.id,
        draftGenerationId: null,
        status: 'failed',
        now: runtime.clock.now()
      });
  }

  async function acceptFacts(
    ctx: Context & { message: { text: string } },
    deps: WriterDeps,
    generation: GenerationRow
  ) {
    const chatId = ctx.chat?.id;
    if (chatId === undefined) return;
    const task = factsTask(generation, ctx.message.text);
    if (task === null) {
      await ctx.reply(
        'Задание и ответ вместе слишком длинные. Сократите ответ или начните /redactor с более коротким заданием.'
      );
      return;
    }
    const claimed = await deps.writer.claimFactAnswer({
      chatId,
      generationId: generation.id,
      answer: ctx.message.text,
      now: runtime.clock.now()
    });
    if (!claimed) {
      await ctx.reply(
        'Ответ на этот вопрос уже принят. Если черновик не появился, повторите по сохранённому ответу через 5 минут.',
        {
          reply_markup: retryKeyboard(generation.id)
        }
      );
      return;
    }
    await writeFactDraft(ctx, generation, task);
  }

  /** The owner's words for a draft: an edited version of its text. */
  async function continueGeneration(
    ctx: Context & { message: { text: string } },
    deps: WriterDeps,
    generation: GenerationRow
  ) {
    try {
      await saveOwnerEdit(deps, generation.id, ctx.message.text);
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
      await ctx.reply(error.code === 'CONFLICT' ? ALREADY_APPROVED_TEXT : FAILED_TEXT);
      return;
    }
    await ctx.reply(EDIT_SAVED_TEXT, {
      reply_markup: new InlineKeyboard().text('Одобрить', `ai:${generation.id}:ok`)
    });
  }

  bot.on('message:text', async (ctx, next) => {
    const replyTo = ctx.message.reply_to_message;
    // A reply to a draft message still works: the owner's own version of the text, or the answer to its question.
    if (replyTo !== undefined && replyTo.from?.id === ctx.me.id) {
      const deps = await runtime.writer();
      const generation = await deps.writer.findByChatMessage(replyTo.message_id);
      if (generation !== null) {
        if (isRequestForFacts(generation)) {
          await acceptFacts(ctx, deps, generation);
          return;
        } else {
          await deps.writer.setEditing({
            chatId: ctx.chat.id,
            generationId: null,
            now: runtime.clock.now(),
            expiresAt: runtime.clock.now() + REQUEST_TTL_MS
          });
        }
        await continueGeneration(ctx, deps, generation);
        return;
      }
    }
    // The chat's mode decides: /post makes every message a draft, /redactor sends it to the editor.
    const now = runtime.clock.now();
    const writer = (await runtime.writer()).writer;
    const chat = await writer.touchRequest(ctx.chat.id, now, now + REQUEST_TTL_MS);
    // One wait at a time (the last one started wins): «✏️ Изменить» or an open question first, then a note.
    // «✏️ Изменить» or an open question: this one message belongs to that draft, whatever the mode.
    if (chat?.editing) {
      const deps = await runtime.writer();
      const generation = await deps.writer.findGeneration(chat.editing);
      if (generation !== null) {
        if (isRequestForFacts(generation)) {
          await acceptFacts(ctx, deps, generation);
          return;
        }
      }
      const claimed = await writer.consumeEditing({ chatId: ctx.chat.id, generationId: chat.editing, now });
      if (!claimed) {
        await ctx.reply('Ответ на этот вопрос уже принят.');
        return;
      }
      if (generation !== null) {
        await continueGeneration(ctx, deps, generation);
        return;
      }
    }
    // «Что не так?» in the owner's own words: this message is the remark, and a fixed version is written.
    if (chat?.fixing && !ctx.message.text.startsWith('/')) {
      const note = feedbackNoteOf(ctx.message.text);
      if (note === null) {
        // Still waiting: the owner may send a shorter one.
        await ctx.reply(REMARK_TOO_LONG_TEXT);
        return;
      }
      const generationId = chat.fixing;
      // A second message at the same moment loses here, without a model call.
      if (!(await writer.consumeFixing({ chatId: ctx.chat.id, generationId, now }))) {
        await ctx.reply(REMARK_TAKEN_TEXT);
        return;
      }
      const revisionId = (await writer.revisions(generationId)).at(-1)?.id;
      if (revisionId === undefined) {
        await ctx.reply(FAILED_TEXT);
        return;
      }
      await enqueue(ctx, REWRITING_TEXT, (base) => ({
        ...base,
        kind: 'fix',
        generationId,
        revisionToken: revisionId.slice(-12),
        note,
        feedbackId: null,
        reason: null
      }));
      return;
    }
    if (chat?.fixing) return next();
    // The note after a «Что не так?» reason: the next message that is not a command. A reply counts too (a reply
    // to a draft was taken above): the natural answer to «Следующее сообщение станет пояснением» is a reply to it.
    if (chat?.noting && !ctx.message.text.startsWith('/')) {
      const deps = await runtime.writer();
      try {
        await saveFeedbackNote(deps, chat.noting, ctx.message.text);
      } catch (error) {
        if (!(error instanceof AppError)) throw error;
        if (error.code === 'VALIDATION_ERROR') {
          // Still waiting: the owner may send a shorter one.
          await ctx.reply(NOTE_INVALID_TEXT);
          return;
        }
        await writer.setNoting({ chatId: ctx.chat.id, feedbackId: null, now, expiresAt: now + REQUEST_TTL_MS });
        await ctx.reply(NOTE_GONE_TEXT);
        return;
      }
      // The note is the remark: the draft it judged is fixed by it (plan P2), once — a second note at the same
      // moment loses this claim and makes no paid model call.
      if (!(await writer.cancelNoting({ chatId: ctx.chat.id, feedbackId: chat.noting }))) {
        await ctx.reply(REMARK_TAKEN_TEXT);
        return;
      }
      const target = await writer.feedbackTarget(chat.noting);
      if (target?.revisionId == null) {
        await ctx.reply(NOTE_SAVED_TEXT);
        return;
      }
      const { generationId, kind, revisionId } = target;
      await enqueue(ctx, REWRITING_TEXT, (base) => ({
        ...base,
        kind: 'fix',
        generationId,
        revisionToken: revisionId.slice(-12),
        note: ctx.message.text.trim(),
        feedbackId: chat.noting,
        reason: kind
      }));
      return;
    }
    // An unknown command while a note is awaited goes to no paid model call (the row may exist only for the wait).
    if (chat?.noting) return next();
    if (chat?.kind === 'post') return next();
    if (chat !== null) {
      if (chat.format === null) await free(ctx, ctx.message.text, chat.history);
      else {
        // A picked format applies to one message; the chat goes on free after it.
        await writer.setRequestFormat({ chatId: ctx.chat.id, promptMessageId: null, format: null, now });
        await draft(ctx, chat.format, ctx.message.text);
      }
      return;
    }
    // Outside a mode a forward is someone else's text: never a paid model call, and no longer a post either.
    if (ctx.message.forward_origin !== undefined) {
      await ctx.reply(NO_MODE_TEXT);
      return;
    }
    const intent = writerIntent(ctx.message.text);
    if (intent === null) {
      await ctx.reply(NO_MODE_TEXT);
      return;
    }
    await draft(ctx, intent.format, intent.task);
  });

  bot.callbackQuery('ai:nonote', async (ctx) => {
    await ctx.answerCallbackQuery({ text: 'Эта кнопка устарела.' });
  });

  bot.callbackQuery(NO_NOTE, async (ctx) => {
    const chatId = ctx.chat?.id;
    if (chatId === undefined) return;
    const feedbackId = ctx.match[1] ?? '';
    const cancelled = await (await runtime.writer()).writer.cancelNoting({ chatId, feedbackId });
    await ctx
      .answerCallbackQuery({ text: cancelled ? NOTE_SKIPPED_TEXT : 'Эта кнопка устарела.' })
      .catch((error: unknown) => runtime.onError(error));
    if (cancelled) await ctx.editMessageReplyMarkup().catch(() => undefined);
  });

  bot.callbackQuery(CALLBACK, async (ctx) => {
    const generationId = ctx.match[1] ?? '';
    const action = (ctx.match[2] ?? '') as Action;
    const revisionToken = ctx.match[3] ?? null;
    const chatId = ctx.chat?.id;
    const messageId = ctx.callbackQuery.message?.message_id;
    if (chatId === undefined || messageId === undefined) return;
    const deps = await runtime.writer();
    try {
      if (
        action.startsWith('h') ||
        action === 'why' ||
        action === 'back' ||
        action.startsWith('r:') ||
        action === 'joke' ||
        action === 'more' ||
        action === 'short' ||
        action === 'fun'
      ) {
        const currentRevisionId = (await deps.writer.revisions(generationId)).at(-1)?.id;
        if (revisionToken === null || currentRevisionId?.slice(-12) !== revisionToken) {
          await ctx.answerCallbackQuery({ text: 'Эта кнопка устарела.' });
          return;
        }
      }
      if (action === 'more' || action === 'short' || action === 'fun') {
        await ctx.answerCallbackQuery().catch((error: unknown) => runtime.onError(error));
        await enqueue(ctx, REWRITING_TEXT, (base) => ({
          ...base,
          kind: 'rewrite',
          generationId,
          action,
          revisionToken: revisionToken ?? ''
        }));
        return;
      }
      if (action === 'edit') {
        const generation = await deps.writer.findGeneration(generationId);
        if (generation === null) throw new AppError('NOT_FOUND', 'The draft is gone');
        const revisions = await deps.writer.revisions(generationId);
        if (approvedRevision(revisions) !== null || isRequestForFacts(generation)) {
          await ctx.answerCallbackQuery({ text: 'Этот текст уже нельзя изменить.' });
          return;
        }
        const current = revisions.at(-1)?.text ?? '';
        await ctx.answerCallbackQuery().catch((error: unknown) => runtime.onError(error));
        const now = runtime.clock.now();
        // One wait at a time: «✏️ Изменить» ends a «Своё время» wait for a publication time.
        const timeWait = await runtime.publish.awaitingTime();
        if (timeWait !== null) await runtime.publish.stopAwaitingTime(timeWait);
        await deps.writer.setEditing({ chatId, generationId, now, expiresAt: now + REQUEST_TTL_MS });
        await ctx.reply(editPromptHtml(current), {
          parse_mode: 'HTML',
          reply_markup: new InlineKeyboard().text('Отмена', `ai:${generationId}:noedit`)
        });
        return;
      }
      if (action === 'noedit') {
        const now = runtime.clock.now();
        const cancelled = await deps.writer.consumeEditing({ chatId, generationId, now });
        await ctx
          .answerCallbackQuery({ text: cancelled ? EDIT_CANCELLED_TEXT : 'Эта кнопка устарела.' })
          .catch((error: unknown) => runtime.onError(error));
        if (cancelled) await ctx.editMessageReplyMarkup().catch(() => undefined);
        return;
      }
      if (action === 'retry') {
        const generation = await deps.writer.findGeneration(generationId);
        if (generation === null || !isRequestForFacts(generation))
          throw new AppError('NOT_FOUND', 'The question is gone');
        const answer = await deps.writer.claimFactRetry({ chatId, generationId, now: runtime.clock.now() });
        if (answer === null) {
          const draftId = await deps.writer.readyFactDraft({ chatId, generationId });
          if (draftId !== null) {
            const draft = await deps.writer.findGeneration(draftId);
            const revision = (await deps.writer.revisions(draftId)).at(-1);
            if (draft !== null && revision !== undefined) {
              await ctx.answerCallbackQuery();
              await edit(
                ctx.api,
                chatId,
                messageId,
                draftHtml({ ...draft, text: revision.text }),
                keyboard(draft.id, draft.hooks, runtime.appOrigin, revision.id)
              );
              await deps.writer.setChatMessage(draft.id, messageId, runtime.clock.now());
              return;
            }
          }
          await ctx.answerCallbackQuery({ text: 'Ответ уже обрабатывается или черновик готов.' });
          return;
        }
        const task = factsTask(generation, answer);
        if (task === null) throw new AppError('CONFLICT', 'The saved answer is too long');
        await ctx.answerCallbackQuery();
        await writeFactDraft(ctx, generation, task);
        return;
      }
      if (action === 'why') {
        await ctx.answerCallbackQuery().catch((error: unknown) => runtime.onError(error));
        await swapButtons(ctx, reasonsKeyboard(generationId, revisionToken ?? ''));
        // The next plain message is the owner's remark on this draft (plan P2); one wait at a time.
        const now = runtime.clock.now();
        const timeWait = await runtime.publish.awaitingTime();
        if (timeWait !== null) await runtime.publish.stopAwaitingTime(timeWait);
        await deps.writer.setFixing({ chatId, generationId, now, expiresAt: now + REQUEST_TTL_MS });
        await ctx.reply(FIX_PROMPT_TEXT);
        return;
      }
      if (action === 'undo') {
        const generation = await deps.writer.findGeneration(generationId);
        const parent =
          generation?.parentGenerationId == null
            ? null
            : await deps.writer.findGeneration(generation.parentGenerationId);
        const revision = parent === null ? undefined : (await deps.writer.revisions(parent.id)).at(-1);
        if (parent === null || revision === undefined) {
          await ctx.answerCallbackQuery({ text: NO_PREVIOUS_TEXT });
          return;
        }
        await ctx.answerCallbackQuery().catch((error: unknown) => runtime.onError(error));
        // The earlier version again, as the newest message with its own buttons; nothing is deleted.
        const message = await ctx.reply(draftHtml({ ...parent, text: revision.text }), {
          parse_mode: 'HTML',
          link_preview_options: { is_disabled: true },
          reply_markup: keyboard(parent.id, parent.hooks, runtime.appOrigin, revision.id)
        });
        await deps.writer.setChatMessage(parent.id, message.message_id, runtime.clock.now());
        return;
      }
      if (action === 'joke' || action === 'back' || action.startsWith('r:')) {
        const reason: Reason | null =
          action === 'joke' ? 'joke' : action === 'back' ? null : (action.slice(2) as Reason);
        const feedbackId =
          reason === null ? null : await recordFeedback(deps, generationId, REASONS[reason].kind, revisionToken ?? '');
        if (reason === null) {
          const now = runtime.clock.now();
          await deps.writer.setFixing({ chatId, generationId: null, now, expiresAt: now + REQUEST_TTL_MS });
        }
        await ctx.answerCallbackQuery(reason === null ? {} : { text: `Записал: ${REASONS[reason].noted}` });
        const generation = await deps.writer.findGeneration(generationId);
        if (generation !== null && action !== 'joke')
          await swapButtons(
            ctx,
            keyboard(
              generation.id,
              generation.hooks,
              runtime.appOrigin,
              (await deps.writer.revisions(generationId)).at(-1)?.id ?? ''
            )
          );
        if (feedbackId !== null && action !== 'joke') {
          // The next plain message is the note; it ends a «Своё время» wait, like «✏️ Изменить» does.
          const now = runtime.clock.now();
          const timeWait = await runtime.publish.awaitingTime();
          if (timeWait !== null) await runtime.publish.stopAwaitingTime(timeWait);
          await deps.writer.setNoting({ chatId, feedbackId, now, expiresAt: now + REQUEST_TTL_MS });
          await ctx.reply(NOTE_PROMPT_TEXT, {
            reply_markup: new InlineKeyboard().text('Без пояснения', `ai:nonote:${feedbackId}`)
          });
        }
        return;
      }
      if (action === 'ok') {
        await ctx.answerCallbackQuery().catch((error: unknown) => runtime.onError(error));
        await approve(ctx, deps, generationId);
        return;
      }
      const text = await chooseHook(deps, generationId, Number(action.slice(1)), revisionToken ?? '');
      await ctx.answerCallbackQuery();
      const generation = await deps.writer.findGeneration(generationId);
      if (generation !== null)
        await edit(
          ctx.api,
          chatId,
          messageId,
          draftHtml({ ...generation, text }),
          keyboard(
            generation.id,
            generation.hooks,
            runtime.appOrigin,
            (await deps.writer.revisions(generationId)).at(-1)?.id ?? ''
          )
        );
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
      await ctx
        .answerCallbackQuery({ text: error.code === 'CONFLICT' ? ALREADY_APPROVED_TEXT : 'Черновик не найден' })
        .catch(() => undefined);
    }
  });

  // Approval stores the final text and its edit ratio. A Telegram text then becomes a studio draft with the
  // usual publish buttons; the post is made from the approved revision only (never from an AI_DRAFT).
  async function approve(ctx: Context, deps: WriterDeps, generationId: string) {
    const generation = await deps.writer.findGeneration(generationId);
    if (generation === null) throw new AppError('NOT_FOUND', 'The draft is gone');
    const revisions = await deps.writer.revisions(generationId);
    if (generation.format === 'telegram' && approvedRevision(revisions) === null) {
      // Checked before approving: an approved text can no longer be edited, so it must already fit a post.
      const current = revisions.at(-1);
      if (current !== undefined && !draftFromMessageText(current.text).ok) {
        await ctx.reply(NOT_A_POST_TEXT);
        return;
      }
    }
    const { created, revision } = await approveDraft(deps, generationId);
    if (generation.format !== 'telegram') {
      await ctx.reply(
        !created
          ? ALREADY_APPROVED_TEXT
          : (revision.editRatio ?? 0) > 0
            ? APPROVED_EDITED_REEL_TEXT
            : APPROVED_REEL_TEXT
      );
      return;
    }
    const approved = await publishableText(deps, generationId);
    if (approved.postId !== null) {
      // Already a post (idempotency keys expire, the link does not): never a second one.
      const markup = publishKeyboard({
        appOrigin: runtime.appOrigin,
        postId: approved.postId,
        buttons: [],
        studio: 'post'
      });
      await ctx.reply(ALREADY_APPROVED_TEXT, markup === undefined ? {} : { reply_markup: markup });
      return;
    }
    const input = draftFromMessageText(approved.text);
    if (!input.ok) {
      await ctx.reply(NOT_A_POST_TEXT);
      return;
    }
    // Keyed by the approved revision: a repeated tap returns the same post.
    const post = await runtime.createDraft(input.input, `ai:${approved.id}`);
    await attachPost(deps, approved.id, post.id);
    const markup = publishKeyboard({
      appOrigin: runtime.appOrigin,
      postId: post.id,
      buttons: await runtime.publish.buttons(post),
      studio: 'post'
    });
    // The final text first, so the owner sees exactly what the post holds before any publish button.
    await ctx.reply(
      `<b>Одобрено, это черновик поста в студии:</b>\n\n${escapeHtml(approved.text.length > SHOWN_TEXT_MAX ? `${approved.text.slice(0, SHOWN_TEXT_MAX)}…` : approved.text)}`,
      {
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
        ...(markup === undefined ? {} : { reply_markup: markup })
      }
    );
  }
}
