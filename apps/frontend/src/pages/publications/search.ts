import { publicationStatusSchema } from '@alexeev/contracts';
import { z } from 'zod';

// «Сегодня» needs an API range filter, so the tab is gone: an old `?view=today` link opens «Все».
export const publicationViewSchema = z
  .enum(['today', 'upcoming', 'recent', 'errors'])
  .transform((view) => (view === 'today' ? undefined : view));
export type PublicationView = z.infer<typeof publicationViewSchema>;

/** URL state of /publications: tab, filters and the open drawer. Pages are not in the URL: they accumulate. */
export const publicationsSearchSchema = z.object({
  view: publicationViewSchema.optional().catch(undefined),
  status: publicationStatusSchema.optional().catch(undefined),
  post: z.uuid().optional().catch(undefined),
  channel: z.uuid().optional().catch(undefined),
  q: z.string().trim().min(1).max(200).optional().catch(undefined),
  order: z.enum(['asc', 'desc']).optional().catch(undefined),
  id: z.uuid().optional().catch(undefined)
});
export type PublicationsSearch = z.infer<typeof publicationsSearchSchema>;
