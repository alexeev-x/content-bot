import { type Bot, InlineKeyboard } from 'grammy';
import type { DotaDraftSource } from '../../modules/dota';

// /events: the latest Steam announcements, past ones included; a tap sends one to the AI writer as if it were new
// (plan item 1, owner 21.10.2026: the path is seen on «The Dark Carnival» without waiting for the next event).

export interface SourceEventsBotRuntime {
  /** The latest Steam announcements, newest first. */
  recent: () => Promise<DotaDraftSource[]>;
  /** Queues the AI draft of one; false when it is hidden or gone. */
  replay: (externalId: string, chatId: number) => Promise<boolean>;
  onError: (error: unknown) => void;
}

const SHOWN = 8;
const TITLE_MAX = 40;
const CALLBACK = /^ev:(\d{1,40})$/;
const LABEL: Record<DotaDraftSource['eventType'], string> = { treasure: '💎', news: '📰', patch: '🛠' };

const PICK_TEXT = 'Какой анонс Steam прогнать через ИИ? Черновик придёт отдельным сообщением, как у нового события.';
const EMPTY_TEXT = 'Анонсов Steam пока нет.';
const QUEUED_TEXT = 'Пишу пост…';
const GONE_TEXT = 'Анонс скрыт или не найден';
const FAILED_TEXT = 'Не удалось поставить в очередь. Попробуйте ещё раз.';

const shortDate = (at: number) => new Date(at).toISOString().slice(0, 10).split('-').reverse().slice(0, 2).join('.');
const clip = (text: string) => (text.length <= TITLE_MAX ? text : `${text.slice(0, TITLE_MAX - 1)}…`);

export function registerSourceEvents(bot: Bot, runtime: SourceEventsBotRuntime): void {
  bot.command('events', async (ctx) => {
    const sources = (await runtime.recent()).slice(0, SHOWN);
    if (sources.length === 0) {
      await ctx.reply(EMPTY_TEXT);
      return;
    }
    const board = new InlineKeyboard();
    for (const source of sources)
      board
        .text(
          `${LABEL[source.eventType]} ${shortDate(source.publishedAt)} · ${clip(source.title)}`,
          `ev:${source.externalId}`
        )
        .row();
    await ctx.reply(PICK_TEXT, { reply_markup: board });
  });

  bot.callbackQuery(CALLBACK, async (ctx) => {
    const externalId = ctx.match[1];
    const chatId = ctx.chat?.id;
    if (externalId === undefined || chatId === undefined) return;
    try {
      const queued = await runtime.replay(externalId, chatId);
      await ctx.answerCallbackQuery({ text: queued ? QUEUED_TEXT : GONE_TEXT });
    } catch (error) {
      runtime.onError(error);
      await ctx.answerCallbackQuery({ text: FAILED_TEXT }).catch(() => undefined);
    }
  });
}
