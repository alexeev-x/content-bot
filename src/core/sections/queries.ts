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
export const saveSection = async (d1: D1Database, row: Omit<SectionRow, 'createdAt'>): Promise<SectionRow> => {
  const [saved] = await drizzle(d1)
    .insert(sections)
    .values({ ...row, createdAt: Date.now() })
    .onConflictDoUpdate({ target: sections.key, set: { threadId: row.threadId, title: row.title } })
    .returning();

  if (!saved) throw new AppError('internal', 'Section was not saved');
  return saved;
};
