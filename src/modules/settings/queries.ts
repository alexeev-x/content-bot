import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { settingsAi } from './table';

export const readAiSettings = async (d1: D1Database) => {
  const [row] = await drizzle(d1).select().from(settingsAi).where(eq(settingsAi.key, 'default')).limit(1);
  return row;
};

export const writeAiSettings = (d1: D1Database, model: string, effort: string) =>
  drizzle(d1)
    .insert(settingsAi)
    .values({ key: 'default', model, effort, updatedAt: Date.now() })
    .onConflictDoUpdate({ target: settingsAi.key, set: { model, effort, updatedAt: Date.now() } });
