import { useMemo } from 'react';
import { useFilter } from 'react-aria-components';

/**
 * Filters the loaded rows by one text per row. Case and diacritics are ignored (React Aria's `contains`). The caller
 * filters rows rather than the table's collection, so counts, selection and the empty state match what is on screen;
 * the phone cards use the same function.
 */
export function useRowSearch<T>(rows: readonly T[], textOf: (row: T) => string, query: string): T[] {
  const { contains } = useFilter({ sensitivity: 'base' });
  const needle = query.trim();
  return useMemo(
    () => (needle === '' ? [...rows] : rows.filter((row) => contains(textOf(row), needle))),
    [rows, textOf, needle, contains]
  );
}
