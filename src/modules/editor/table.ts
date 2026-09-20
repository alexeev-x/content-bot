import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

/** Рубрики и их правила принадлежат редактору: пока у них нет другого потребителя. */
export const editorRubrics = sqliteTable('editor_rubrics', {
  key: text('key').primaryKey(),
  title: text('title').notNull(),
  instructions: text('instructions').notNull(),
  createdAt: integer('created_at').notNull(),
});

/** Материал — карточка исходного сообщения; текст живёт только в неизменяемых версиях. */
export const editorMaterials = sqliteTable(
  'editor_materials',
  {
    id: text('id').primaryKey(),
    sourceChatId: integer('source_chat_id').notNull(),
    sourceMessageId: integer('source_message_id').notNull(),
    threadId: integer('thread_id').notNull(),
    rubricKey: text('rubric_key'),
    kind: text('kind', { enum: ['draft', 'author_example'] }).notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [uniqueIndex('editor_materials_source_message_unique').on(table.sourceChatId, table.sourceMessageId)],
);

export const editorMaterialVersions = sqliteTable(
  'editor_material_versions',
  {
    id: text('id').primaryKey(),
    materialId: text('material_id').notNull(),
    number: integer('number').notNull(),
    content: text('content').notNull(),
    source: text('source', { enum: ['author', 'assistant'] }).notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [uniqueIndex('editor_material_versions_number_unique').on(table.materialId, table.number)],
);

/** Явные постоянные предпочтения, а не скрытое «обучение» на всей переписке. */
export const editorMemory = sqliteTable(
  'editor_memory',
  {
    id: text('id').primaryKey(),
    sourceChatId: integer('source_chat_id').notNull(),
    sourceMessageId: integer('source_message_id').notNull(),
    scope: text('scope', { enum: ['global', 'rubric'] }).notNull(),
    rubricKey: text('rubric_key'),
    value: text('value').notNull(),
    sourceMaterialId: text('source_material_id'),
    createdAt: integer('created_at').notNull(),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
  },
  (table) => [uniqueIndex('editor_memory_source_message_unique').on(table.sourceChatId, table.sourceMessageId)],
);

export type EditorRubricRow = typeof editorRubrics.$inferSelect;
export type EditorMaterialRow = typeof editorMaterials.$inferSelect;
export type EditorMemoryRow = typeof editorMemory.$inferSelect;
