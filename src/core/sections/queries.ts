import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { AppError } from 'src/lib/errors';
import { type SectionRow, sections } from './table';

export const listSections = (d1: D1Database): Promise<SectionRow[]> => drizzle(d1).select().from(sections);

export const findSectionByThreadId = async (d1: D1Database, threadId: number): Promise<SectionRow | undefined> => {
  const [row] = await drizzle(d1).select().from(sections).where(eq(sections.threadId, threadId)).limit(1);
  return row;
};

/** Тему могли пересоздать — тогда у того же раздела новый thread_id. */
export const saveSection = async (
  d1: D1Database,
  row: Omit<SectionRow, 'createdAt' | 'introduced'>,
): Promise<SectionRow> => {
  const [saved] = await drizzle(d1)
    .insert(sections)
    .values({ ...row, introduced: false, createdAt: Date.now() })
    .onConflictDoNothing()
    .returning();

  const existing = saved ?? (await findSectionByThreadId(d1, row.threadId));
  if (!existing || existing.key !== row.key) throw new AppError('internal', 'Section was not saved');
  return existing;
};

export const markSectionIntroduced = async (d1: D1Database, key: string) => {
  await drizzle(d1).update(sections).set({ introduced: true }).where(eq(sections.key, key));
};

export const renameSection = async (d1: D1Database, key: string, title: string) => {
  await drizzle(d1).update(sections).set({ title }).where(eq(sections.key, key));
};
