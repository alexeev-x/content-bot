import { and, eq, lte, ne } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { AppError } from 'src/lib/errors';
import { telegramUpdates as updates } from './table';

export const claimUpdate = async (
  d1: D1Database,
  updateId: number,
  payload: string,
  owner: string,
): Promise<'claimed' | 'done' | 'busy'> => {
  const db = drizzle(d1);
  await db
    .insert(updates)
    .values({ updateId, payload, receivedAt: Date.now(), state: 'pending' })
    .onConflictDoNothing();
  const [row] = await db.select().from(updates).where(eq(updates.updateId, updateId));
  if (row?.state === 'done') return 'done';
  if (!row || row.payload !== payload) throw new AppError('bad_request', 'Update id conflicts with its payload');
  const claimed = await db
    .update(updates)
    .set({ state: 'processing', owner, leaseUntil: Date.now() + 120_000, lastError: null })
    .where(and(eq(updates.updateId, updateId), ne(updates.state, 'done'), lte(updates.leaseUntil, Date.now())))
    .returning();
  return claimed.length ? 'claimed' : 'busy';
};

export const finishUpdate = async (
  d1: D1Database,
  updateId: number,
  owner: string,
  errorCode?: string,
): Promise<void> => {
  await drizzle(d1)
    .update(updates)
    .set({ state: errorCode ? 'pending' : 'done', leaseUntil: 0, owner: null, lastError: errorCode ?? null })
    .where(and(eq(updates.updateId, updateId), eq(updates.owner, owner)));
};
