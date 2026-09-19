import { AppError, isAppError } from 'src/lib/errors';
import { finishOperation, readOperation, reserveOperation, retryOperation } from './queries';

/** Журнал закрывает повторы известных результатов; неопределённый результат требует сверки. */
export const executeOperation = async (
  d1: D1Database,
  key: string,
  method: string,
  payload: unknown,
  send: () => Promise<unknown>,
): Promise<unknown> => {
  const serialized = JSON.stringify(payload);
  let claimed = await reserveOperation(d1, key, method, serialized);
  if (!claimed) {
    const row = await readOperation(d1, key);
    if (!row || row.method !== method || row.payload !== serialized)
      throw new AppError('internal', 'Operation key conflicts with its payload');
    if (row.state === 'succeeded') return JSON.parse(row.result!) as unknown;
    if (row.state === 'unknown' || (row.state === 'sending' && row.updatedAt < Date.now() - 120_000))
      throw new AppError('outcome_unknown', 'Telegram operation needs reconciliation');
    if (row.state === 'failed') throw new AppError('upstream_failed', 'Telegram rejected this operation');
    if (row.state === 'retry') claimed = await retryOperation(d1, key);
    if (!claimed) throw new AppError('operation_busy', 'Telegram operation is pending', { retryable: true });
  }
  let result: unknown;
  try {
    result = await send();
  } catch (error) {
    const known = isAppError(error) && error.code === 'upstream_failed';
    await finishOperation(d1, key, {
      state: known ? (error.retryable ? 'retry' : 'failed') : 'unknown',
      notBefore: Date.now() + (isAppError(error) ? error.retryAfterMs : 0),
    });
    throw error;
  }
  // Если D1 откажет здесь, sending сохраняется: повтор внешнего эффекта запрещён.
  await finishOperation(d1, key, { state: 'succeeded', result: JSON.stringify(result) });
  return result;
};
