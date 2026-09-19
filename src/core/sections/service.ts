import type { SectionDefinition } from 'src/const/sections';
import type { TelegramApi } from 'src/core/telegram';
import { logger } from 'src/lib/logger';
import { findSectionByThreadId, listSections, markSectionIntroduced, saveSection } from './queries';
import type { SectionRow } from './table';

type Deps = {
  d1: D1Database;
  telegram: TelegramApi;
  /** Разделы объявляют фичи-владельцы; сюда они приходят собранными в composition root. */
  catalog: readonly SectionDefinition[];
};

/** Что знает о разделе внешний потребитель: название, назначение и тема. */
export type SectionView = { key: string; title: string; intro: string; threadId: number };

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

    /** Вход допускает только личный чат владельца. Журнал Telegram сериализует создание тем. */
    ensure: async (chatId: number): Promise<void> => {
      const known = new Map((await listSections(d1)).map((row) => [row.key, row]));

      for (const definition of catalog) {
        let row = known.get(definition.key);
        const operationKey = `section:${chatId}:${definition.key}`;
        if (!row) {
          const topic = await telegram.createTopic({
            chatId,
            name: definition.title,
            iconColor: definition.color,
            operationKey: `${operationKey}:create`,
          });
          row = await saveSection(d1, { key: definition.key, threadId: topic.threadId, title: definition.title });
          logger.info('section created', { key: definition.key, threadId: topic.threadId });
        }
        // Сохраняем известную тему ДО приветствия: его сбой не создаст другую тему.
        if (!row.introduced) {
          await telegram.sendMessage({
            chatId,
            text: definition.intro,
            threadId: row.threadId,
            operationKey: `${operationKey}:intro`,
          });
          await markSectionIntroduced(d1, definition.key);
        }
      }
    },
  };
};

export type Sections = ReturnType<typeof createSections>;
