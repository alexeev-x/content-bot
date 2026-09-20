import { and, desc, eq, isNull, lt } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import type { EditorReply, TextMessage } from './schema';
import {
  editorMaterialVersions,
  editorMaterials,
  editorMemory,
  editorRubrics,
  editorGenerations,
  editorConversations,
  type EditorConversationRow,
  type EditorGenerationRow,
  type EditorMaterialRow,
  type EditorMemoryRow,
  type EditorRubricRow,
} from './table';

export const readConversation = async (d1: D1Database, chatId: number, threadId: number) => {
  const [row] = await drizzle(d1)
    .select()
    .from(editorConversations)
    .where(and(eq(editorConversations.chatId, chatId), eq(editorConversations.threadId, threadId)))
    .limit(1);
  return row;
};

export const writeConversation = async (
  d1: D1Database,
  row: Pick<EditorConversationRow, 'chatId' | 'threadId' | 'draftText' | 'taskText'>,
) => {
  await drizzle(d1)
    .insert(editorConversations)
    .values({ id: crypto.randomUUID(), ...row, updatedAt: Date.now() })
    .onConflictDoUpdate({
      target: [editorConversations.chatId, editorConversations.threadId],
      set: { draftText: row.draftText, taskText: row.taskText, updatedAt: Date.now() },
    });
};

export const seedRubrics = async (d1: D1Database, rows: readonly Omit<EditorRubricRow, 'createdAt'>[]) => {
  const db = drizzle(d1);
  for (const row of rows) {
    await db
      .insert(editorRubrics)
      .values({ ...row, createdAt: Date.now() })
      .onConflictDoNothing();
  }
};

export const listRubrics = (d1: D1Database): Promise<EditorRubricRow[]> =>
  drizzle(d1).select().from(editorRubrics).orderBy(editorRubrics.createdAt);

export const findMaterialBySource = async (
  d1: D1Database,
  sourceChatId: number,
  sourceMessageId: number,
): Promise<EditorMaterialRow | undefined> => {
  const [row] = await drizzle(d1)
    .select()
    .from(editorMaterials)
    .where(and(eq(editorMaterials.sourceChatId, sourceChatId), eq(editorMaterials.sourceMessageId, sourceMessageId)))
    .limit(1);
  return row;
};

export const saveMaterial = async (d1: D1Database, row: EditorMaterialRow, content: string) => {
  const db = drizzle(d1);
  await db.insert(editorMaterials).values(row).onConflictDoNothing();
  const material = (await findMaterialBySource(d1, row.sourceChatId, row.sourceMessageId)) ?? row;
  await db
    .insert(editorMaterialVersions)
    .values({
      id: crypto.randomUUID(),
      materialId: material.id,
      number: 1,
      content,
      source: 'author',
      createdAt: Date.now(),
    })
    .onConflictDoNothing();
  return material;
};

export const saveMemory = async (d1: D1Database, row: Omit<EditorMemoryRow, 'createdAt' | 'active'>) => {
  await drizzle(d1)
    .insert(editorMemory)
    .values({ ...row, createdAt: Date.now(), active: true })
    .onConflictDoNothing();
};

export const listMemory = (d1: D1Database): Promise<EditorMemoryRow[]> =>
  drizzle(d1).select().from(editorMemory).where(eq(editorMemory.active, true)).orderBy(desc(editorMemory.createdAt));

export const listAuthorExamples = async (d1: D1Database, rubricKey: string | null) => {
  const rows = await drizzle(d1)
    .select({ content: editorMaterialVersions.content })
    .from(editorMaterials)
    .innerJoin(editorMaterialVersions, eq(editorMaterialVersions.materialId, editorMaterials.id))
    .where(
      and(
        eq(editorMaterials.kind, 'author_example'),
        rubricKey === null ? isNull(editorMaterials.rubricKey) : eq(editorMaterials.rubricKey, rubricKey),
      ),
    )
    .orderBy(desc(editorMaterialVersions.createdAt))
    .limit(3);
  return rows.map((row) => row.content);
};

export const findGenerationBySource = async (d1: D1Database, sourceChatId: number, sourceMessageId: number) => {
  const [row] = await drizzle(d1)
    .select()
    .from(editorGenerations)
    .where(
      and(eq(editorGenerations.sourceChatId, sourceChatId), eq(editorGenerations.sourceMessageId, sourceMessageId)),
    )
    .limit(1);
  return row;
};

/** Одним INSERT резервируем бюджет: два параллельных запроса не могут пройти лимит вместе. */
export const reserveGeneration = async (d1: D1Database, row: EditorGenerationRow, limitMicros: number) => {
  await d1
    .prepare(
      `INSERT INTO editor_generations (
        id, source_chat_id, source_message_id, material_id, month_key, request_text, state,
        reserved_cost_micros, charged_cost_micros, created_at, updated_at, thread_id
      )
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      WHERE ? >= COALESCE((SELECT SUM(charged_cost_micros) FROM editor_generations WHERE month_key = ?), 0) + ?
      ON CONFLICT(source_chat_id, source_message_id) DO NOTHING`,
    )
    .bind(
      row.id,
      row.sourceChatId,
      row.sourceMessageId,
      row.materialId,
      row.monthKey,
      row.requestText,
      row.state,
      row.reservedCostMicros,
      row.chargedCostMicros,
      row.createdAt,
      row.updatedAt,
      row.threadId,
      limitMicros,
      row.monthKey,
      row.chargedCostMicros,
    )
    .run();
  return findGenerationBySource(d1, row.sourceChatId, row.sourceMessageId);
};

export const completeGeneration = async (
  d1: D1Database,
  input: Pick<
    EditorGenerationRow,
    'id' | 'state' | 'chargedCostMicros' | 'inputTokens' | 'outputTokens' | 'responseText'
  >,
) => {
  await drizzle(d1)
    .update(editorGenerations)
    .set({
      state: input.state,
      chargedCostMicros: input.chargedCostMicros,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      responseText: input.responseText,
      updatedAt: Date.now(),
    })
    .where(eq(editorGenerations.id, input.id));
};

export const monthGenerationCost = async (d1: D1Database, monthKey: string) => {
  const total = await d1
    .prepare('SELECT COALESCE(SUM(charged_cost_micros), 0) AS cost FROM editor_generations WHERE month_key = ?')
    .bind(monthKey)
    .first<{ cost: number }>();
  return total?.cost ?? 0;
};

export const recentDialogue = (d1: D1Database, input: TextMessage) =>
  drizzle(d1)
    .select({
      messageId: editorGenerations.sourceMessageId,
      user: editorGenerations.requestText,
      assistant: editorGenerations.responseText,
    })
    .from(editorGenerations)
    .where(
      and(
        eq(editorGenerations.sourceChatId, input.chatId),
        eq(editorGenerations.threadId, input.threadId),
        eq(editorGenerations.state, 'succeeded'),
        lt(editorGenerations.sourceMessageId, input.messageId),
      ),
    )
    .orderBy(desc(editorGenerations.sourceMessageId))
    .limit(6);

export const currentMaterial = async (d1: D1Database, id: string | null | undefined) => {
  if (!id) return undefined;
  const [row] = await drizzle(d1)
    .select()
    .from(editorMaterialVersions)
    .where(eq(editorMaterialVersions.materialId, id))
    .orderBy(desc(editorMaterialVersions.number))
    .limit(1);
  return row;
};

/** Аренда длиннее HTTP-дедлайна. Старый обработчик не может записать результат после её перехвата. */
export const claimConversation = async (d1: D1Database, input: TextMessage, token: string) => {
  const now = Date.now();
  const result = await d1
    .prepare(
      `INSERT INTO editor_conversations (id, chat_id, thread_id, updated_at, lock_token, lock_until)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(chat_id, thread_id) DO UPDATE SET lock_token = excluded.lock_token, lock_until = excluded.lock_until
    WHERE editor_conversations.lock_until <= ?`,
    )
    .bind(crypto.randomUUID(), input.chatId, input.threadId, now, token, now + 90_000, now)
    .run();
  return result.meta.changes === 1;
};

export const releaseConversation = (d1: D1Database, input: TextMessage, token: string) =>
  d1
    .prepare(
      'UPDATE editor_conversations SET lock_token = NULL, lock_until = 0 WHERE chat_id = ? AND thread_id = ? AND lock_token = ?',
    )
    .bind(input.chatId, input.threadId, token)
    .run();

/** Материал, правило, ответ и состояние разговора фиксируются одним атомарным batch. */
export const commitReply = async (
  d1: D1Database,
  input: TextMessage,
  token: string,
  decision: EditorReply,
  options: {
    generationId: string;
    materialId: string | null;
    continuing: boolean;
    cost: number;
    inputTokens: number;
    outputTokens: number;
    responseText: string;
  },
) => {
  const now = Date.now();
  const gate =
    'EXISTS (SELECT 1 FROM editor_conversations WHERE chat_id = ? AND thread_id = ? AND lock_token = ? AND lock_until > ?)';
  const guard = [input.chatId, input.threadId, token, now];
  const statements: D1PreparedStatement[] = [];
  const writesMaterial = ['material', 'save_draft', 'save_example'].includes(decision.action);
  if (writesMaterial) {
    if (!options.continuing)
      statements.push(
        d1
          .prepare(
            `INSERT INTO editor_materials
      (id, source_chat_id, source_message_id, thread_id, rubric_key, kind, created_at)
      SELECT ?, ?, ?, ?, ?, ?, ? WHERE ${gate}`,
          )
          .bind(
            options.materialId,
            input.chatId,
            input.messageId,
            input.threadId,
            decision.rubricKey,
            decision.action === 'save_example' ? 'author_example' : 'draft',
            now,
            ...guard,
          ),
      );
    statements.push(
      d1
        .prepare(
          `INSERT INTO editor_material_versions (id, material_id, number, content, source, created_at)
      SELECT ?, ?, COALESCE((SELECT MAX(number) FROM editor_material_versions WHERE material_id = ?), 0) + 1, ?, ?, ? WHERE ${gate}`,
        )
        .bind(
          crypto.randomUUID(),
          options.materialId,
          options.materialId,
          decision.content,
          decision.action === 'material' ? 'assistant' : 'author',
          now,
          ...guard,
        ),
    );
  }
  if (decision.action === 'forget' || (decision.action === 'remember' && decision.memoryId)) {
    statements.push(
      d1.prepare(`UPDATE editor_memory SET active = 0 WHERE id = ? AND ${gate}`).bind(decision.memoryId, ...guard),
    );
  }
  if (decision.action === 'remember') {
    statements.push(
      d1
        .prepare(
          `INSERT INTO editor_memory
      (id, source_chat_id, source_message_id, scope, rubric_key, value, source_material_id, created_at, active)
      SELECT ?, ?, ?, ?, ?, ?, NULL, ?, 1 WHERE ${gate}`,
        )
        .bind(
          crypto.randomUUID(),
          input.chatId,
          input.messageId,
          decision.rubricKey ? 'rubric' : 'global',
          decision.rubricKey,
          decision.content,
          now,
          ...guard,
        ),
    );
  }
  statements.push(
    d1
      .prepare(
        `UPDATE editor_generations SET state = 'succeeded', material_id = ?, decision_text = ?, response_text = ?,
    charged_cost_micros = ?, input_tokens = ?, output_tokens = ?, updated_at = ? WHERE id = ? AND ${gate}`,
      )
      .bind(
        writesMaterial ? options.materialId : null,
        JSON.stringify(decision),
        options.responseText,
        options.cost,
        options.inputTokens,
        options.outputTokens,
        now,
        options.generationId,
        ...guard,
      ),
  );
  const changesCurrent = decision.action === 'material' || decision.action === 'save_draft';
  statements.push(
    d1
      .prepare(
        `UPDATE editor_conversations SET material_id = CASE WHEN ? THEN ? ELSE material_id END,
    rubric_key = CASE WHEN ? THEN ? ELSE rubric_key END, draft_text = NULL, task_text = NULL,
    lock_token = NULL, lock_until = 0, updated_at = ? WHERE chat_id = ? AND thread_id = ? AND ${gate}`,
      )
      .bind(
        changesCurrent ? 1 : 0,
        options.materialId,
        changesCurrent ? 1 : 0,
        decision.rubricKey,
        now,
        input.chatId,
        input.threadId,
        ...guard,
      ),
  );
  const results = await d1.batch(statements);
  return results.at(-1)?.meta.changes === 1;
};
