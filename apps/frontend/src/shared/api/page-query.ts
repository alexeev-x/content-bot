/** Rows per page on the admin tables; the server receives it as `limit` next to `page`. */
export { PAGE_SIZE } from '@alexeev/contracts';

/**
 * `placeholderData` for page queries: while the next page, a settled search or another tab loads, the previous rows
 * stay on screen instead of a skeleton. `useTabSwitch` tells the screen whose rows those are.
 */
export function keepPreviousRows<T>(previous: T | undefined): T | undefined {
  return previous;
}
