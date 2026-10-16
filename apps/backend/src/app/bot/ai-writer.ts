import type { CreatePostInput } from '@alexeev/contracts';
import { type Bot, type Context, GrammyError, InlineKeyboard } from 'grammy';
import type { InlineKeyboardMarkup } from 'grammy/types';
import {
  approveDraft,
  approvedRevision,
  attachPost,
  chooseHook,
  describeCheck,
  FORMAT_LABEL,
  generateDraft,
  publishableText,
  recordFeedback,
  rewriteDraft,
  saveOwnerEdit,
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
const FAILED_TEXT = 'Не получилось написать. Попробуйте ещё раз.';
const EMPTY_TASK_TEXT = 'Напишите после команды, о чём текст. Например: /post как я апнул 3к';
const APPROVED_REEL_TEXT = 'Одобрено. Текст сохранён, его правки ИИ запомнит.';
const ALREADY_APPROVED_TEXT = 'Уже одобрено.';
const NOT_A_POST_TEXT =
  'Текст не влезает в пост (длиннее 4096 символов или с недопустимыми символами). Нажмите «Короче» или ответьте своей версией.';
const EDIT_SAVED_TEXT = 'Сохранил вашу версию. Одобрить её?';

const COMMAND_FORMAT: Record<string, WriterFormat> = {
  post: 'telegram',
  fidit: 'fidit',
  igrat: 'igrat',
  reel: 'standalone'
};

const REWRITES = {
  more: 'другой вариант: другой заход, другие шутки, тот же смысл',
  short: 'короче примерно на треть, без потери главного',
  fun: 'смешнее: больше живых шуток и мемов автора, без кринжа'
} as const;
type Action = 'h0' | 'h1' | 'h2' | keyof typeof REWRITES | 'joke' | 'ok';
const CALLBACK = /^ai:([0-9a-f-]{36}):(h[0-2]|more|short|fun|joke|ok)$/;

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
  board.text('Шутка не зашла', data('joke')).text('Одобрить', data('ok'));
  if (appOrigin !== null) board.row().webApp('Открыть студию', `${appOrigin}/`);
  return board;
}

function draftHtml(result: {
  format: WriterFormat;
  hooks: readonly string[];
  warnings: readonly string[];
  text: string;
}) {
  const lines = [`<b>${FORMAT_LABEL[result.format]}</b>`];
  if (result.hooks.length > 0)
    lines.push('', 'Хуки:', ...result.hooks.map((hook, index) => `${index + 1}. ${escapeHtml(hook)}`));
  const text = result.text.length > SHOWN_TEXT_MAX ? `${result.text.slice(0, SHOWN_TEXT_MAX)}…` : result.text;
  lines.push('', escapeHtml(text));
  if (result.warnings.length > 0)
    lines.push('', `<i>Проверка: ${escapeHtml(result.warnings.map(describeCheck).join('; '))}</i>`);
  lines.push('', '<i>Ответьте на это сообщение своей версией — сохраню как правку.</i>');
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

/** The part of the bot runtime the writer uses (create-bot's `BotRuntime` provides it). */
export interface AiWriterRuntime {
  appOrigin: string;
  clock: Clock;
  writer: () => Promise<WriterDeps>;
  createDraft: (input: CreatePostInput, idempotencyKey: string) => Promise<{ id: string; revision: number }>;
  publish: Pick<PublishActions, 'buttons'>;
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
          if (result.text === null) {
            await edit(ctx, chatId, message.message_id, FAILED_TEXT);
            return;
          }
          const { generation } = result;
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

  bot.command(Object.keys(COMMAND_FORMAT), async (ctx) => {
    const format = COMMAND_FORMAT[ctx.message?.text.slice(1).split(/[\s@]/)[0] ?? ''];
    const task = ctx.match.trim();
    if (format === undefined) return;
    if (task === '') {
      await ctx.reply(EMPTY_TASK_TEXT);
      return;
    }
    await draft(ctx, format, task);
  });

  bot.on('message:text', async (ctx, next) => {
    const replyTo = ctx.message.reply_to_message;
    // A reply to a draft message: the owner's own version of the text.
    if (replyTo !== undefined && replyTo.from?.id === ctx.me.id) {
      const deps = await runtime.writer();
      const generation = await deps.writer.findByChatMessage(replyTo.message_id);
      if (generation !== null) {
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
        return;
      }
    }
    // A forward is someone else's text: always a plain draft, never a paid model call.
    const intent = ctx.message.forward_origin === undefined ? writerIntent(ctx.message.text) : null;
    if (intent === null) return next();
    await draft(ctx, intent.format, intent.task);
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
      if (action === 'joke') {
        await recordFeedback(deps, generationId, 'joke_missed');
        await ctx.answerCallbackQuery({ text: 'Записал: шутка не зашла' });
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
      const markup = publishKeyboard({ appOrigin: runtime.appOrigin, postId: approved.postId, buttons: [] });
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
      buttons: await runtime.publish.buttons(post)
    });
    await ctx.reply('Одобрено, черновик поста создан', markup === undefined ? {} : { reply_markup: markup });
  }
}
