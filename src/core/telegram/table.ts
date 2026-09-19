import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/** Исходящие действия. sending после обрыва нельзя автоматически выполнять заново. */
export const telegramOperations = sqliteTable(
  'telegram_operations',
  {
    key: text('key').primaryKey(),
    method: text('method').notNull(),
    payload: text('payload').notNull(),
    state: text('state', { enum: ['sending', 'succeeded', 'retry', 'failed', 'unknown'] }).notNull(),
    result: text('result'),
    updatedAt: integer('updated_at').notNull(),
    notBefore: integer('not_before').notNull().default(0),
  },
  (table) => [index('telegram_operations_state_idx').on(table.state)],
);
