import { Bot } from 'grammy';
import type { UserFromGetMe } from 'grammy/types';
import type { Config } from 'src/app/config';
import { findCommandSpec, isCommandAvailable } from 'src/const/commands';
import type { Sections } from 'src/core/sections';
import type { TelegramApi } from 'src/core/telegram';
import { AppError, isAppError } from 'src/lib/errors';
import { logger } from 'src/lib/logger';
import type { BotCallbackHandler, BotCommand, BotTextHandler } from 'src/types/bot';
import { createController } from './controller';
import { claimUpdate, finishUpdate } from './queries';

type Deps = {
  config: Config;
  d1: D1Database;
  telegram: TelegramApi;
  sections: Sections;
  /** Команды модулей-владельцев. Телеграм-модуль их только регистрирует. */
  commands: BotCommand[];
  textHandlers: BotTextHandler[];
  callbackHandlers: BotCallbackHandler[];
};

/**
 * grammY требует botInfo до обработки апдейта и по умолчанию берёт его вызовом getMe —
 * лишний запрос в Telegram на КАЖДЫЙ апдейт. Берём из BOT_INFO, иначе спрашиваем раз на изолят.
 * Сам Bot создаём заново на каждый запрос, чтобы не утащить env прошлого вызова.
 */
let cachedBotInfo: UserFromGetMe | undefined;

const notHere = (titles: readonly string[]) =>
  `Эта команда работает в других разделах: ${titles.join(', ')}. Открой нужный и повтори.`;

const errorNotice = (error: unknown) => {
  if (!isAppError(error))
    return 'Что-то пошло не так. Запрос не выполнен, но бот продолжает работать. Попробуй ещё раз.';
  if (error.code === 'outcome_unknown')
    return 'Не удалось понять, выполнился ли запрос. Я не повторяю его автоматически, чтобы не создать дубль.';
  if (error.code === 'not_configured') return 'Эта функция пока не настроена. Проверь настройки и повтори запрос.';
  return 'Не получилось выполнить запрос. Попробуй ещё раз позже.';
};

/**
 * grammY здесь отвечает только за разбор апдейта и маршрутизацию команд.
 * Всё исходящее идёт через core/telegram — та же отправка работает из очереди и cron.
 */
export const createBot = async ({ config, d1, telegram, sections, commands, textHandlers, callbackHandlers }: Deps) => {
  const botInfo = config.BOT_INFO ?? cachedBotInfo;
  const bot = new Bot(config.BOT_TOKEN, { botInfo, client: { timeoutSeconds: 10 } });

  if (!botInfo) {
    await bot.init();
    cachedBotInfo = bot.botInfo;
  }

  // Бот личный: чужие апдейты молча игнорируем, не раскрывая факт существования бота.
  bot.use(async (ctx, next) => {
    if (
      ctx.from?.id !== config.OWNER_TELEGRAM_ID ||
      ctx.chat?.type !== 'private' ||
      ctx.chat.id !== config.OWNER_TELEGRAM_ID
    ) {
      logger.warn('update from stranger ignored', { updateId: ctx.update.update_id });
      return;
    }
    await next();
  });

  // Сохраняем вход и аренду обработки. После аварии повтор продолжит подтверждённые шаги.
  bot.use(async (ctx, next) => {
    const owner = crypto.randomUUID();
    const state = await claimUpdate(d1, ctx.update.update_id, JSON.stringify(ctx.update), owner);
    if (state === 'done') {
      logger.info('duplicate update skipped', { updateId: ctx.update.update_id });
      return;
    }
    if (state === 'busy') throw new AppError('operation_busy', 'Update is being processed', { retryable: true });

    try {
      await next();
      await finishUpdate(d1, ctx.update.update_id, owner);
    } catch (error) {
      const chatId = ctx.chat?.id;
      if (chatId !== undefined) {
        await telegram
          .sendMessage({
            chatId,
            threadId: ctx.message?.message_thread_id,
            text: errorNotice(error),
            operationKey: `update:${ctx.update.update_id}:error-notice`,
          })
          .catch(() => logger.error('failed to send error notice', { updateId: ctx.update.update_id }));
      }
      // Ошибка одного сообщения не должна запирать long polling бесконечными повторами.
      await finishUpdate(d1, ctx.update.update_id, owner).catch(() =>
        logger.error('failed to finish failed update', { updateId: ctx.update.update_id }),
      );
    }
  });

  // Разделы заводятся сами при первом же сообщении — отдельную команду помнить не нужно.
  // Создаётся только недостающее, поэтому вызов на каждый апдейт безвреден: это один SELECT.
  bot.use(async (ctx, next) => {
    const chatId = ctx.chat?.id;
    if (chatId !== undefined) await sections.ensure(chatId);
    await next();
  });

  const { own, onText } = createController({ telegram, sections, textHandlers });

  for (const { name, handle } of [...own, ...commands]) {
    bot.command(name, async (ctx) => {
      const threadId = ctx.message?.message_thread_id;
      const section = await sections.findByThreadId(threadId);
      const spec = findCommandSpec(name);

      // Меню в Telegram одно на чат — тему оно не различает. Разграничение делаем здесь:
      // команду из чужого раздела не выполняем, а подсказываем, где она работает.
      if (!isCommandAvailable(spec, section?.key)) {
        await telegram.sendMessage({
          chatId: ctx.chat.id,
          threadId,
          // Показываем названия, а не ключи: «editor» пользователю ничего не говорит.
          text: notHere(await sections.titlesOf(spec?.sections ?? [])),
        });
        return;
      }

      await handle({
        chatId: ctx.chat.id,
        threadId,
        section: section && { key: section.key, title: section.title },
        text: ctx.message?.text ?? '',
      });
    });
  }

  bot.on('message:text', onText);
  bot.on('callback_query:data', async (ctx) => {
    const message = ctx.callbackQuery.message;
    if (!message) return;
    for (const handle of callbackHandlers) {
      if (
        await handle({
          callbackId: ctx.callbackQuery.id,
          chatId: message.chat.id,
          messageId: message.message_id,
          threadId: message.message_thread_id,
          data: ctx.callbackQuery.data,
        })
      ) {
        await ctx.answerCallbackQuery();
        logger.info('callback handled', { updateId: ctx.update.update_id });
        return;
      }
    }
  });

  // Не подтверждаем незавершённую работу. Тексты внешних ошибок могут содержать секреты.
  bot.catch(({ error, ctx }) => {
    logger.error('bot handler failed', {
      updateId: ctx.update.update_id,
      code: isAppError(error) ? error.code : 'internal',
    });

    throw error;
  });

  return bot;
};
