import { Bot } from 'grammy';
import type { UserFromGetMe } from 'grammy/types';
import type { Config } from 'src/app/config';
import { findCommandSpec, isCommandAvailable } from 'src/const/commands';
import type { Sections } from 'src/core/sections';
import type { TelegramApi } from 'src/core/telegram';
import { logger } from 'src/lib/logger';
import type { BotCommand } from 'src/types/bot';
import { createController } from './controller';
import { claimUpdate, releaseUpdate } from './queries';

type Deps = {
  config: Config;
  d1: D1Database;
  telegram: TelegramApi;
  sections: Sections;
  /** Команды модулей-владельцев. Телеграм-модуль их только регистрирует. */
  commands: BotCommand[];
};

/**
 * grammY требует botInfo до обработки апдейта и по умолчанию берёт его вызовом getMe —
 * лишний запрос в Telegram на КАЖДЫЙ апдейт. Берём из BOT_INFO, иначе спрашиваем раз на изолят.
 * Сам Bot создаём заново на каждый запрос, чтобы не утащить env прошлого вызова.
 */
let cachedBotInfo: UserFromGetMe | undefined;

const notHere = (titles: readonly string[]) =>
  `Эта команда работает в других разделах: ${titles.join(', ')}. Открой нужный и повтори.`;

/**
 * grammY здесь отвечает только за разбор апдейта и маршрутизацию команд.
 * Всё исходящее идёт через core/telegram — та же отправка работает из очереди и cron.
 */
export const createBot = async ({ config, d1, telegram, sections, commands }: Deps) => {
  const botInfo = config.BOT_INFO ?? cachedBotInfo;
  const bot = new Bot(config.BOT_TOKEN, { botInfo });

  if (!botInfo) {
    await bot.init();
    cachedBotInfo = bot.botInfo;
  }

  // Бот личный: чужие апдейты молча игнорируем, не раскрывая факт существования бота.
  bot.use(async (ctx, next) => {
    if (ctx.from?.id !== config.OWNER_TELEGRAM_ID) {
      logger.warn('update from stranger ignored', { updateId: ctx.update.update_id });
      return;
    }
    await next();
  });

  // Отметку ставим ДО работы, иначе два одновременных дубля обработаются оба.
  // Если работа не удалась — снимаем, чтобы повторная доставка сработала, а сообщение не пропало.
  // Полноценно это решает таблица заданий на этапе 2: падать и повторяться будет задание.
  bot.use(async (ctx, next) => {
    if (!(await claimUpdate(d1, ctx.update.update_id))) {
      logger.info('duplicate update skipped', { updateId: ctx.update.update_id });
      return;
    }

    try {
      await next();
    } catch (error) {
      // Сбой снятия отметки не должен подменить исходную ошибку: иначе причина потеряется,
      // а в логах останется жалоба на базу вместо настоящей поломки.
      await releaseUpdate(d1, ctx.update.update_id).catch((cause) =>
        logger.error('failed to release update', { updateId: ctx.update.update_id, cause: String(cause) }),
      );

      throw error;
    }
  });

  // Разделы заводятся сами при первом же сообщении — отдельную команду помнить не нужно.
  // Создаётся только недостающее, поэтому вызов на каждый апдейт безвреден: это один SELECT.
  bot.use(async (ctx, next) => {
    const chatId = ctx.chat?.id;
    if (chatId !== undefined) await sections.ensure(chatId);
    await next();
  });

  const { own, onText } = createController({ telegram, sections });

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

  // Ошибку логируем и пробрасываем дальше. Проглотить её нельзя: Telegram получил бы 200,
  // повторной доставки не случилось бы, а отметку дедупа мы к этому моменту уже сняли —
  // сообщение исчезло бы бесследно.
  bot.catch(({ error, ctx }) => {
    logger.error('bot handler failed', {
      updateId: ctx.update.update_id,
      message: error instanceof Error ? error.message : 'unknown',
    });

    throw error;
  });

  return bot;
};
