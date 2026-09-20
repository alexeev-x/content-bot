import { and, desc, eq, max } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import {
  editorMaterialVersions,
  editorMaterials,
  editorMemory,
  editorRubrics,
  editorGenerations,
  type EditorGenerationRow,
  type EditorMaterialRow,
  type EditorMemoryRow,
  type EditorRubricRow,
} from './table';

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
        rubricKey === null ? undefined : eq(editorMaterials.rubricKey, rubricKey),
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
        reserved_cost_micros, charged_cost_micros, created_at, updated_at
      )
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      WHERE ? >= COALESCE((SELECT SUM(charged_cost_micros) FROM editor_generations WHERE month_key = ?), 0) + ?`,
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

export const saveAssistantVersion = async (d1: D1Database, materialId: string, content: string) => {
  const db = drizzle(d1);
  const [latest] = await db
    .select({ number: max(editorMaterialVersions.number) })
    .from(editorMaterialVersions)
    .where(eq(editorMaterialVersions.materialId, materialId));
  await db
    .insert(editorMaterialVersions)
    .values({
      id: crypto.randomUUID(),
      materialId,
      number: (latest?.number ?? 0) + 1,
      content,
      source: 'assistant',
      createdAt: Date.now(),
    })
    .onConflictDoNothing();
};
