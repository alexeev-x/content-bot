import { z } from 'zod';

// Keyset pagination: the cursor is opaque to the client and only echoed back.
export function pageSchema<T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item),
    nextCursor: z.string().nullable()
  });
}
export interface PageDto<T> {
  items: T[];
  nextCursor: string | null;
}

export const pageQuerySchema = z.strictObject({
  cursor: z.string().min(1).max(512).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});

export const PAGE_NUMBER_MAX = 1000;
export const PAGE_SIZE = 10;

// Page-number pagination for the admin tables (posts, publications, media). `page` (1-based) is an
// alternative to `cursor`; sending both is a validation error. The tables send limit=PAGE_SIZE.
// With `page` the response carries `page` and `totalCount`, and `nextCursor` is null.
export const offsetPageQuerySchema = pageQuerySchema.extend({
  page: z.coerce.number().int().min(1).max(PAGE_NUMBER_MAX).optional()
});

export function cursorXorPage(query: { cursor?: string | undefined; page?: number | undefined }): boolean {
  return query.cursor === undefined || query.page === undefined;
}
export const CURSOR_XOR_PAGE_ISSUE = { error: 'Use either cursor or page, not both', path: ['page'] };

export const offsetPageFields = {
  page: z.number().int().positive().nullable(),
  totalCount: z.number().int().nonnegative()
};
