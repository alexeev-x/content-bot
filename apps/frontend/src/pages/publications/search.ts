import { publicationStatusSchema } from '@alexeev/contracts';
import { z } from 'zod';

export const publicationViewSchema = z.enum(['today', 'upcoming', 'recent', 'errors']);
export type PublicationView = z.infer<typeof publicationViewSchema>;

/** URL state of /publications: presets, filters, page cursor and the open drawer. */
export const publicationsSearchSchema = z.object({
  view: publicationViewSchema.optional().catch(undefined),
  status: publicationStatusSchema.optional().catch(undefined),
  post: z.uuid().optional().catch(undefined),
  channel: z.uuid().optional().catch(undefined),
  q: z.string().trim().min(1).max(200).optional().catch(undefined),
  order: z.enum(['asc', 'desc']).optional().catch(undefined),
  cursor: z.string().min(1).max(512).optional().catch(undefined),
  id: z.uuid().optional().catch(undefined)
});
export type PublicationsSearch = z.infer<typeof publicationsSearchSchema>;
