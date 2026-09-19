import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Защита от повторной доставки: Telegram присылает тот же update_id, если не дождался ответа.
 * update_id — первичный ключ, поэтому повтор ловится самой вставкой.
 */
export const telegramUpdates = sqliteTable(
  'telegram_updates',
  {
    updateId: integer('update_id').primaryKey(),
    receivedAt: integer('received_at').notNull(),
    // Старые отметки считаем завершёнными: их входных данных уже нет.
    state: text('state', { enum: ['pending', 'processing', 'done'] })
      .notNull()
      .default('done'),
    payload: text('payload'),
    leaseUntil: integer('lease_until').notNull().default(0),
    owner: text('owner'),
    lastError: text('last_error'),
  },
  (table) => [index('telegram_updates_state_idx').on(table.state)],
);
