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
