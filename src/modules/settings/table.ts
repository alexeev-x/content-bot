import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/** Единственная глобальная настройка модели для личного бота. */
export const settingsAi = sqliteTable('settings_ai', {
  key: text('key').primaryKey(),
  model: text('model').notNull(),
  effort: text('effort').notNull(),
  updatedAt: integer('updated_at').notNull(),
});
