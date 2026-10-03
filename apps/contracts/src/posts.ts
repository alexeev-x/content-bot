import { z } from 'zod';

// Editorial state only; scheduling and delivery live in publications.
export const postStatusSchema = z.enum(['draft', 'approved']);

export const postSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  body: z.string(),
  revision: z.number().int().nonnegative(),
  status: postStatusSchema,
  updatedAt: z.iso.datetime(),
});
export type PostDto = z.infer<typeof postSchema>;
