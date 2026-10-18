import type { CreatePostInput } from '@alexeev/contracts';
import { type Bot, type Context, GrammyError, InlineKeyboard } from 'grammy';
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
import { draftFromMessageText } from './draft-from-message';
import { publishKeyboard } from './publish-keyboard';

// The AI writer in the owner's chat (docs/backend/bot.md «AI writer»): a request in plain words or a command
// becomes a draft; buttons rewrite, pick a hook, give feedback or approve; a reply with text is the owner's
// edit. Only an approved Telegram text becomes a studio post, through the usual draft and publish flow.

/** Telegram ends a webhook's background work after ~30 s; the model gets most of it. */
const MODEL_TIMEOUT_MS = 25_000;
/** A message is at most 4096 characters; the rest stays in the draft. */
const SHOWN_TEXT_MAX = 3300;

const WRITING_TEXT = 'Пишу…';
const REWRITING_TEXT = 'Переписываю…';
const THINKING_TEXT = 'Думаю…';
const FAILED_TEXT = 'Не получилось написать. Попробуйте ещё раз.';
const APPROVED_REEL_TEXT = 'Одобрено. Текст сохранён, его правки ИИ запомнит.';
const ALREADY_APPROVED_TEXT = 'Уже одобрено.';
const NOT_A_POST_TEXT =
  'Текст не влезает в пост (длиннее 4096 символов или с недопустимыми символами). Нажмите «Короче» или ответьте своей версией.';
const EDIT_SAVED_TEXT = 'Сохранил вашу версию. Одобрить её?';
const EDIT_CANCELLED_TEXT = 'Правка отменена';
const NOTE_PROMPT_TEXT =
  'Если хотите, поясните одним сообщением (до 500 знаков) — я только запишу это, правилом оно не станет. Следующее сообщение станет пояснением.';
const NOTE_SAVED_TEXT = 'Записал пояснение.';
const NOTE_INVALID_TEXT =
  'Пояснение — от 1 до 500 знаков, без служебных символов. Пришлите короче или нажмите «Без пояснения».';
const NOTE_GONE_TEXT = 'Этот вердикт уже снят, пояснение не записал.';
const NOTE_SKIPPED_TEXT = 'Хорошо, без пояснения';
const NO_NOTE = 'ai:nonote';
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
// `joke` stays for the buttons of messages sent before «Что не так?».
type Action =
  'h0' | 'h1' | 'h2' | keyof typeof REWRITES | 'joke' | 'ok' | 'why' | 'back' | 'edit' | 'noedit' | `r:${Reason}`;
const CALLBACK =
  /^ai:([0-9a-f-]{36}):(h[0-2]|more|short|fun|joke|ok|why|back|edit|noedit|r:(?:topic|hook|joke|style|long|fact|task))$/;

const escapeHtml = (value: string): string =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

/**
 * A request for a text in plain words: «напиши пост в тг про …», «сделай рилс учусь играть про …». Anything
 * else stays an ordinary draft, as before. Returns the format and the task (the whole message).
 */
export function writerIntent(text: string): { format: WriterFormat; task: string } | null {
  const lower = text.toLowerCase();
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

function keyboard(generationId: string, hooks: readonly string[], appOrigin: string | null): InlineKeyboardMarkup {
  const data = (action: Action) => `ai:${generationId}:${action}`;
  const board = new InlineKeyboard();
  hooks.forEach((_hook, index) => board.text(`Хук ${index + 1}`, data(`h${index}` as Action)));
  if (hooks.length > 0) board.row();
  board.text('Ещё вариант', data('more')).text('Короче', data('short')).text('Смешнее', data('fun')).row();
  board.text('✏️ Изменить', data('edit')).text('Что не так?', data('why')).row();
  board.text('Одобрить', data('ok'));
  if (appOrigin !== null) board.row().webApp('Открыть студию', `${appOrigin}/`);
  return board;
}

/** The reasons, two per row, and the way back to the draft's buttons. */
function reasonsKeyboard(generationId: string): InlineKeyboardMarkup {
  const board = new InlineKeyboard();
  (Object.keys(REASONS) as Reason[]).forEach((reason, index) => {
    board.text(REASONS[reason].label, `ai:${generationId}:r:${reason}`);
    if (index % 2 === 1) board.row();
  });
  return board.text('← Назад', `ai:${generationId}:back`);
}

/** The model asked for the owner's facts (result needs_facts, or the NEEDS_FACTS warning of an older row). */
function isRequestForFacts(generation: Pick<GenerationRow, 'result' | 'warnings'>): boolean {
  return generation.result === 'needs_facts' || generation.warnings.includes(NEEDS_FACTS);
}

function factsHtml(generation: Pick<GenerationRow, 'format' | 'question' | 'ideas'>): string {
  const lines = [`<b>${FORMAT_LABEL[generation.format]}: нужны ваши детали</b>`, ''];
  if (generation.ideas.length > 0)
    lines.push('Идеи:', ...generation.ideas.map((idea, index) => `${index + 1}. ${escapeHtml(idea)}`), '');
  lines.push(
    escapeHtml(generation.question ?? 'Что было в игре?'),
    '',
    generation.ideas.length > 0
      ? '<i>Напишите следующим сообщением номер идеи и что у вас было — напишу сценарий по вашему опыту.</i>'
      : '<i>Напишите следующим сообщением, что у вас было, — напишу сценарий по вашему опыту.</i>'
  );
  return lines.join('\n');
}

function draftHtml(result: {
  format: WriterFormat;
  hooks: readonly string[];
  warnings: readonly string[];
  text: string;
}) {
  if (result.warnings.includes(NEEDS_FACTS))
    return [
      `<b>${FORMAT_LABEL[result.format]}: нужны ваши детали</b>`,
      '',
      escapeHtml(result.text),
      '',
      '<i>Напишите следующим сообщением, что у вас было, — напишу сценарий по вашему опыту.</i>'
    ].join('\n');
  const lines = [`<b>${FORMAT_LABEL[result.format]}</b>`];
  if (result.hooks.length > 0)
    lines.push('', 'Хуки:', ...result.hooks.map((hook, index) => `${index + 1}. ${escapeHtml(hook)}`));
  const text = result.text.length > SHOWN_TEXT_MAX ? `${result.text.slice(0, SHOWN_TEXT_MAX)}…` : result.text;
  lines.push('', escapeHtml(text));
  if (result.warnings.length > 0)
    lines.push('', `<i>Проверка: ${escapeHtml(result.warnings.map(describeCheck).join('; '))}</i>`);
  lines.push('', '<i>Своя версия — кнопка «✏️ Изменить».</i>');
  return lines.join('\n');
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

async function edit(ctx: Context, chatId: number, messageId: number, html: string, markup?: InlineKeyboardMarkup) {
  try {
    await ctx.api.editMessageText(chatId, messageId, html, {
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
  waitUntil: (work: Promise<unknown>) => void;
  onError: (error: unknown) => void;
}

export function registerAiWriter(bot: Bot, runtime: AiWriterRuntime): void {
  // Answers «Пишу…» at once, then writes after the webhook answered and turns that message into the draft.
  async function write(
    ctx: Context,
    placeholder: string,
    work: (deps: WriterDeps, signal: AbortSignal) => Promise<WriterResult>
  ) {
    const chatId = ctx.chat?.id;
    if (chatId === undefined) return;
    const message = await ctx.reply(placeholder);
    runtime.waitUntil(
      (async () => {
        try {
          const deps = await runtime.writer();
          const result = await work(deps, AbortSignal.timeout(MODEL_TIMEOUT_MS));
          for (const event of result.budgetEvents)
            await ctx.api.sendMessage(chatId, formatAiBudgetAlert(event), { parse_mode: 'HTML' });
          const { generation } = result;
          if (isRequestForFacts(generation)) {
            // A question has nothing to approve or rewrite: no keyboard; the owner's reply continues it.
            await deps.writer.setChatMessage(generation.id, message.message_id, runtime.clock.now());
            // The next plain message answers it (owner, 17.10.2026: replying to a message is awkward).
            const now = runtime.clock.now();
            await deps.writer.setEditing({ chatId, generationId: generation.id, now, expiresAt: now + REQUEST_TTL_MS });
            await edit(ctx, chatId, message.message_id, factsHtml(generation));
            return;
          }
          if (result.text === null) {
            await edit(ctx, chatId, message.message_id, FAILED_TEXT);
            return;
          }
          await deps.writer.setChatMessage(generation.id, message.message_id, runtime.clock.now());
          await edit(
            ctx,
            chatId,
            message.message_id,
            draftHtml({ ...generation, text: result.text }),
            keyboard(generation.id, generation.hooks, runtime.appOrigin)
          );
        } catch (error) {
          if (!(error instanceof AppError && error.code === 'UNAVAILABLE')) runtime.onError(error);
          const text = error instanceof AppError && error.code === 'UNAVAILABLE' ? unavailableText(error) : FAILED_TEXT;
          await edit(ctx, chatId, message.message_id, text).catch((editError: unknown) => runtime.onError(editError));
        }
      })()
    );
  }

  const draft = (ctx: Context, format: WriterFormat, task: string) =>
    write(ctx, WRITING_TEXT, (deps, signal) =>
      generateDraft(deps, { format, mode: 'direct', source: 'bot', task, signal })
    );

  // /redactor: one command for everything (owner, 16.10.2026: no format buttons). The next text, or the words
  // after the command, is a free request; «придумай рилс …» or «напиши пост …» in it still makes a draft.
  // A free request: «напиши рилс учусь играть про …» still becomes a draft with its buttons; anything else gets
  // one answer in the author's voice.
  const endKeyboard = () => new InlineKeyboard().text('Закончить', END_CHAT);
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
    const chatId = ctx.chat?.id;
    if (chatId === undefined) return;
    const message = await ctx.reply(THINKING_TEXT);
    runtime.waitUntil(
      (async () => {
        try {
          const deps = await runtime.writer();
          const answer = await askEditor(deps, {
            task: text,
            history: history ?? [],
            signal: AbortSignal.timeout(MODEL_TIMEOUT_MS)
          });
          for (const event of answer.budgetEvents)
            await ctx.api.sendMessage(chatId, formatAiBudgetAlert(event), { parse_mode: 'HTML' });
          const shown =
            answer.text === null
              ? FAILED_TEXT
              : escapeHtml(answer.text.length > 4000 ? `${answer.text.slice(0, 4000)}…` : answer.text);
          await edit(ctx, chatId, message.message_id, shown, history === null ? undefined : endKeyboard());
          if (history !== null && answer.text !== null)
            await deps.writer.saveHistory(
              chatId,
              [
                ...history,
                { role: 'owner' as const, text: text.slice(0, TURN_MAX) },
                { role: 'editor' as const, text: answer.text.slice(0, TURN_MAX) }
              ].slice(-HISTORY_TURNS)
            );
        } catch (error) {
          const unavailable = error instanceof AppError && error.code === 'UNAVAILABLE';
          if (!unavailable) runtime.onError(error);
          await edit(ctx, chatId, message.message_id, unavailable ? unavailableText(error) : FAILED_TEXT).catch(
            (editError: unknown) => runtime.onError(editError)
          );
        }
      })()
    );
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

  bot.callbackQuery(END_CHAT, async (ctx) => {
    const chatId = ctx.chat?.id;
    if (chatId === undefined) return;
    await (await runtime.writer()).writer.closeRequest(chatId);
    await ctx.answerCallbackQuery().catch((error: unknown) => runtime.onError(error));
    await ctx.editMessageReplyMarkup().catch(() => undefined);
    await ctx.reply(CHAT_ENDED_TEXT);
  });

  /** The owner's words for a draft: the answer to its question, or the owner's own version of its text. */
  async function continueGeneration(
    ctx: Context & { message: { text: string } },
    deps: WriterDeps,
    generation: GenerationRow
  ) {
    if (isRequestForFacts(generation)) {
      // The answer to the model's question: the draft is written again from the same task, the ideas it offered
      // and the owner's experience, so nothing of the original request is lost.
      const ideas =
        generation.ideas.length > 0
          ? `\n\nИдеи редактора:\n${generation.ideas.map((idea, index) => `${index + 1}. ${idea}`).join('\n')}`
          : '';
      const task = `${generation.task}${ideas}\n\nОпыт автора (его слова):\n${ctx.message.text}`.slice(0, 4000);
      await write(ctx, WRITING_TEXT, (writerDeps, signal) =>
        generateDraft(writerDeps, { format: generation.format, mode: generation.mode, source: 'bot', task, signal })
      );
      return;
    }
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
        await deps.writer.setEditing({
          chatId: ctx.chat.id,
          generationId: null,
          now: runtime.clock.now(),
          expiresAt: runtime.clock.now() + REQUEST_TTL_MS
        });
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
      await writer.setEditing({ chatId: ctx.chat.id, generationId: null, now, expiresAt: now + REQUEST_TTL_MS });
      const generation = await deps.writer.findGeneration(chat.editing);
      if (generation !== null) {
        await continueGeneration(ctx, deps, generation);
        return;
      }
    }
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
      await writer.setNoting({ chatId: ctx.chat.id, feedbackId: null, now, expiresAt: now + REQUEST_TTL_MS });
      await ctx.reply(NOTE_SAVED_TEXT);
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

  bot.callbackQuery(NO_NOTE, async (ctx) => {
    const chatId = ctx.chat?.id;
    if (chatId === undefined) return;
    const now = runtime.clock.now();
    await (await runtime.writer()).writer.setNoting({ chatId, feedbackId: null, now, expiresAt: now + REQUEST_TTL_MS });
    await ctx.answerCallbackQuery({ text: NOTE_SKIPPED_TEXT }).catch((error: unknown) => runtime.onError(error));
    await ctx.editMessageReplyMarkup().catch(() => undefined);
  });

  bot.callbackQuery(CALLBACK, async (ctx) => {
    const generationId = ctx.match[1] ?? '';
    const action = (ctx.match[2] ?? '') as Action;
    const chatId = ctx.chat?.id;
    const messageId = ctx.callbackQuery.message?.message_id;
    if (chatId === undefined || messageId === undefined) return;
    if (action === 'more' || action === 'short' || action === 'fun') {
      await ctx.answerCallbackQuery().catch((error: unknown) => runtime.onError(error));
      await write(ctx, REWRITING_TEXT, (deps, signal) =>
        rewriteDraft(deps, { generationId, instruction: REWRITES[action], signal })
      );
      return;
    }
    const deps = await runtime.writer();
    try {
      if (action === 'edit') {
        await ctx.answerCallbackQuery().catch((error: unknown) => runtime.onError(error));
        const generation = await deps.writer.findGeneration(generationId);
        if (generation === null) throw new AppError('NOT_FOUND', 'The draft is gone');
        const current = (await deps.writer.revisions(generationId)).at(-1)?.text ?? '';
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
        await deps.writer.setEditing({ chatId, generationId: null, now, expiresAt: now + REQUEST_TTL_MS });
        await ctx.answerCallbackQuery({ text: EDIT_CANCELLED_TEXT }).catch((error: unknown) => runtime.onError(error));
        await ctx.editMessageReplyMarkup().catch(() => undefined);
        return;
      }
      if (action === 'why') {
        await ctx.answerCallbackQuery().catch((error: unknown) => runtime.onError(error));
        await swapButtons(ctx, reasonsKeyboard(generationId));
        return;
      }
      if (action === 'joke' || action === 'back' || action.startsWith('r:')) {
        const reason: Reason | null =
          action === 'joke' ? 'joke' : action === 'back' ? null : (action.slice(2) as Reason);
        const feedbackId = reason === null ? null : await recordFeedback(deps, generationId, REASONS[reason].kind);
        await ctx.answerCallbackQuery(reason === null ? {} : { text: `Записал: ${REASONS[reason].noted}` });
        const generation = await deps.writer.findGeneration(generationId);
        if (generation !== null && action !== 'joke')
          await swapButtons(ctx, keyboard(generation.id, generation.hooks, runtime.appOrigin));
        if (feedbackId !== null && action !== 'joke') {
          // The next plain message is the note; it ends a «Своё время» wait, like «✏️ Изменить» does.
          const now = runtime.clock.now();
          const timeWait = await runtime.publish.awaitingTime();
          if (timeWait !== null) await runtime.publish.stopAwaitingTime(timeWait);
          await deps.writer.setNoting({ chatId, feedbackId, now, expiresAt: now + REQUEST_TTL_MS });
          await ctx.reply(NOTE_PROMPT_TEXT, { reply_markup: new InlineKeyboard().text('Без пояснения', NO_NOTE) });
        }
        return;
      }
      if (action === 'ok') {
        await ctx.answerCallbackQuery().catch((error: unknown) => runtime.onError(error));
        await approve(ctx, deps, generationId);
        return;
      }
      const text = await chooseHook(deps, generationId, Number(action.slice(1)));
      await ctx.answerCallbackQuery();
      const generation = await deps.writer.findGeneration(generationId);
      if (generation !== null)
        await edit(
          ctx,
          chatId,
          messageId,
          draftHtml({ ...generation, text }),
          keyboard(generation.id, generation.hooks, runtime.appOrigin)
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
    const { created } = await approveDraft(deps, generationId);
    if (generation.format !== 'telegram') {
      await ctx.reply(created ? APPROVED_REEL_TEXT : ALREADY_APPROVED_TEXT);
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
