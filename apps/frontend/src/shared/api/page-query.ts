import type { Query } from '@tanstack/react-query';

/** Rows per page on the admin tables; the server receives it as `limit` next to `page`. */
export { PAGE_SIZE } from '@alexeev/contracts';

/**
 * `placeholderData` for page queries: while the next page (or a settled search) loads, the previous rows stay on
 * screen instead of a skeleton. Data is kept only inside one scope (the table's tab), never across tabs.
 */
export function keepPreviousInScope(scope: string) {
  return <T>(previous: T | undefined, previousQuery: Query<T, Error, T> | undefined): T | undefined =>
    previousQuery?.meta?.scope === scope ? previous : undefined;
}
