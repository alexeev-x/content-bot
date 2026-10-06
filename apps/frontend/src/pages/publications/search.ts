import { publicationStatusSchema } from '@alexeev/contracts';
import { z } from 'zod';

/** URL state of /publications: filters, page cursor and the open drawer. `.catch` keeps a hand-edited URL usable. */
export const publicationsSearchSchema = z.object({
  status: publicationStatusSchema.optional().catch(undefined),
  channel: z.uuid().optional().catch(undefined),
  cursor: z.string().min(1).max(512).optional().catch(undefined),
  id: z.uuid().optional().catch(undefined)
});
export type PublicationsSearch = z.infer<typeof publicationsSearchSchema>;
