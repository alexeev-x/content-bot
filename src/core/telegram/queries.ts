import { and, eq, lte } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { telegramOperations as operations } from './table';

export const reserveOperation = async (d1: D1Database, key: string, method: string, payload: string) => {
  const rows = await drizzle(d1)
    .insert(operations)
    .values({ key, method, payload, state: 'sending', updatedAt: Date.now() })
    .onConflictDoNothing()
    .returning();
  return rows.length > 0;
};

export const readOperation = async (d1: D1Database, key: string) => {
  const [row] = await drizzle(d1).select().from(operations).where(eq(operations.key, key));
  return row;
};

export const retryOperation = async (d1: D1Database, key: string) => {
  const rows = await drizzle(d1)
    .update(operations)
    .set({ state: 'sending', updatedAt: Date.now() })
    .where(and(eq(operations.key, key), eq(operations.state, 'retry'), lte(operations.notBefore, Date.now())))
    .returning();
  return rows.length > 0;
};

export const finishOperation = async (
  d1: D1Database,
  key: string,
  values: {
    state: 'succeeded' | 'retry' | 'failed' | 'unknown';
    result?: string;
    notBefore?: number;
  },
) => {
  await drizzle(d1)
    .update(operations)
    .set({ ...values, updatedAt: Date.now() })
    .where(and(eq(operations.key, key), eq(operations.state, 'sending')));
};
