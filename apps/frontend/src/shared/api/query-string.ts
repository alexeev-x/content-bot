import type { PageDto } from '@alexeev/contracts';

export const DEFAULT_PAGE_SIZE = 20;

/** Builds `?a=1&b=2`, skipping undefined values; empty string when there is nothing to send. */
export function buildQuery(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

/** `getNextPageParam` for cursor lists: the cursor is opaque and only echoed back. */
export function nextCursor(page: PageDto<unknown>): string | undefined {
  return page.nextCursor ?? undefined;
}
