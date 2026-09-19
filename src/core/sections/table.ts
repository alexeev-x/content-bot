import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { SectionKey } from 'src/const/sections';

/**
 * Разделы бота = темы в личном чате. По thread_id входящего сообщения определяется,
 * в каком разделе идёт разговор, поэтому он уникален.
 */
export const sections = sqliteTable('sections', {
  key: text('key').$type<SectionKey>().primaryKey(),
  threadId: integer('thread_id').notNull().unique(),
  title: text('title').notNull(),
  createdAt: integer('created_at').notNull(),
  introduced: integer('introduced', { mode: 'boolean' }).notNull().default(true),
});

export type SectionRow = typeof sections.$inferSelect;
