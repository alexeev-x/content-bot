import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

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

/** Состояние платной генерации хранится отдельно от материала: неизвестный исход нельзя повторять вслепую. */
export const editorGenerations = sqliteTable(
  'editor_generations',
  {
    id: text('id').primaryKey(),
    sourceChatId: integer('source_chat_id').notNull(),
    sourceMessageId: integer('source_message_id').notNull(),
    materialId: text('material_id'),
    threadId: integer('thread_id'),
    decisionText: text('decision_text'),
    monthKey: text('month_key').notNull(),
    requestText: text('request_text').notNull(),
    state: text('state', { enum: ['calling', 'succeeded', 'failed', 'unknown'] }).notNull(),
    reservedCostMicros: integer('reserved_cost_micros').notNull(),
    chargedCostMicros: integer('charged_cost_micros').notNull(),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    responseText: text('response_text'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('editor_generations_source_message_unique').on(table.sourceChatId, table.sourceMessageId),
    index('editor_generations_history').on(table.sourceChatId, table.threadId, table.sourceMessageId),
    index('editor_generations_month').on(table.monthKey),
  ],
);

/** Незавершённый разговор: черновик и задача живут между двумя обычными сообщениями автора. */
export const editorConversations = sqliteTable(
  'editor_conversations',
  {
    id: text('id').primaryKey(),
    chatId: integer('chat_id').notNull(),
    threadId: integer('thread_id').notNull(),
    draftText: text('draft_text'),
    taskText: text('task_text'),
    materialId: text('material_id'),
    rubricKey: text('rubric_key'),
    lockToken: text('lock_token'),
    lockUntil: integer('lock_until').notNull().default(0),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [uniqueIndex('editor_conversations_chat_thread_unique').on(table.chatId, table.threadId)],
);

export type EditorRubricRow = typeof editorRubrics.$inferSelect;
export type EditorMaterialRow = typeof editorMaterials.$inferSelect;
export type EditorMemoryRow = typeof editorMemory.$inferSelect;
export type EditorGenerationRow = typeof editorGenerations.$inferSelect;
export type EditorConversationRow = typeof editorConversations.$inferSelect;
