import { integer, sqliteTable } from 'drizzle-orm/sqlite-core';

/**
 * Защита от повторной доставки: Telegram присылает тот же update_id, если не дождался ответа.
 * update_id — первичный ключ, поэтому повтор ловится самой вставкой.
 */
export const telegramUpdates = sqliteTable('telegram_updates', {
  updateId: integer('update_id').primaryKey(),
  receivedAt: integer('received_at').notNull(),
});
