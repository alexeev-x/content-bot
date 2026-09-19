import type { SectionDefinition } from 'src/const/sections';
import type { TelegramApi } from 'src/core/telegram';
import { logger } from 'src/lib/logger';
import { findSectionByThreadId, listSections, saveSection } from './queries';
import type { SectionRow } from './table';

type Deps = {
  d1: D1Database;
  telegram: TelegramApi;
  /** Разделы объявляют фичи-владельцы; сюда они приходят собранными в composition root. */
  catalog: readonly SectionDefinition[];
};

/** Что знает о разделе внешний потребитель: название, назначение и тема. */
export type SectionView = { key: string; title: string; intro: string; threadId: number };

/** Все разделы на месте. Живёт на изоляте, не в диалоге: это кэш, а не состояние переписки. */
let complete = false;

export const createSections = ({ d1, telegram, catalog }: Deps) => {
  const intros = new Map(catalog.map((item) => [item.key, item.intro]));

  const toView = (row: SectionRow): SectionView => ({
    key: row.key,
    title: row.title,
    intro: intros.get(row.key) ?? '',
    threadId: row.threadId,
  });

  return {
    /** Все разделы для справки: вход не должен знать каталог фичи, он получает готовое. */
    list: async (): Promise<SectionView[]> => (await listSections(d1)).map(toView),

    /** Назначение раздела по ключу — из каталога, без обращения к базе. */
    intro: async (key: string): Promise<string> => intros.get(key) ?? '',

    /** Названия разделов для сообщений пользователю: ключи вроде «editor» ему ничего не говорят. */
    titlesOf: async (keys: readonly string[]): Promise<string[]> =>
      catalog.filter((item) => keys.includes(item.key)).map((item) => item.title),

    /** Раздел, в котором идёт разговор. Без thread_id это общая часть чата, а не раздел. */
    findByThreadId: async (threadId?: number): Promise<SectionView | undefined> => {
      if (threadId === undefined) return undefined;
      const row = await findSectionByThreadId(d1, threadId);
      return row && toView(row);
    },

    /**
     * Доводит набор тем до каталога: чего нет — создаёт, что есть — оставляет. Идемпотентно.
     *
     * Вызывается на каждый апдейт, поэтому результат запоминаем на изолят: холодный старт делает
     * один SELECT, дальнейшие сообщения — ни одного. Заодно сужается окно, в котором два
     * одновременных апдейта могли бы создать по теме каждый.
     *
     * ⚠️ Создание темы и запись в D1 — не одна транзакция: упадём между ними, и останется
     * осиротевшая тема. Лечится таблицей заданий на этапе 2, отдельного костыля здесь не строим.
     */
    ensure: async (chatId: number): Promise<void> => {
      if (complete) return;

      const known = new Set((await listSections(d1)).map((row) => row.key));

      for (const definition of catalog) {
        if (known.has(definition.key)) continue;

        const topic = await telegram.createTopic({ chatId, name: definition.title, iconColor: definition.color });

        // Пустая тема выглядит как ошибка: сразу пишем, зачем она.
        await telegram.sendMessage({ chatId, text: definition.intro, threadId: topic.threadId });
        await saveSection(d1, { key: definition.key, threadId: topic.threadId, title: definition.title });

        logger.info('section created', { key: definition.key, threadId: topic.threadId });
      }

      complete = true;
    },
  };
};

export type Sections = ReturnType<typeof createSections>;
