import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { telegramUpdates } from './table';

/** Дедуп повторных доставок. Вставка вернёт пустой массив, если такой update уже был. */
export const claimUpdate = async (d1: D1Database, updateId: number): Promise<boolean> => {
  const inserted = await drizzle(d1)
    .insert(telegramUpdates)
    .values({ updateId, receivedAt: Date.now() })
    .onConflictDoNothing()
    .returning({ updateId: telegramUpdates.updateId });

  return inserted.length > 0;
};

/**
 * Снять отметку, если обработка не удалась: иначе повторная доставка Telegram будет отброшена
 * дедупом и сообщение потеряется навсегда.
 */
export const releaseUpdate = async (d1: D1Database, updateId: number): Promise<void> => {
  await drizzle(d1).delete(telegramUpdates).where(eq(telegramUpdates.updateId, updateId));
};
