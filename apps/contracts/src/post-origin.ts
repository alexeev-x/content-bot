import { z } from 'zod';

/**
 * Who wrote a post, for the owner only (never sent to a channel or shown to readers): `ai` — it came from an
 * approved AI-editor draft, written in the bot or the studio, with the share of words the owner changed before
 * approval (null when unknown). A post without an origin was written by the owner. Its own file: posts and
 * publications both carry it, and posts already import publications.
 */
export const postOriginSchema = z.object({
  kind: z.literal('ai'),
  source: z.enum(['bot', 'studio']),
  editRatio: z.number().min(0).max(1).nullable()
});
export type PostOriginDto = z.infer<typeof postOriginSchema>;
