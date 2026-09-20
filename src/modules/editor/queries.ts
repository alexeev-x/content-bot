import { and, desc, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import {
  editorMaterialVersions,
  editorMaterials,
  editorMemory,
  editorRubrics,
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
