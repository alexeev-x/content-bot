import { z } from 'zod';

// «Сегодня» needs an API range filter, so the tab is gone: an old `?view=today` link opens «Все».
export const publicationViewSchema = z
  .enum(['today', 'upcoming', 'recent', 'errors'])
  .transform((view) => (view === 'today' ? undefined : view));
export type PublicationView = z.infer<typeof publicationViewSchema>;

/**
 * URL state of /publications: tab, one post, sort and the open drawer. Pages are not in the URL: they accumulate.
 * The search text is local, and the old `?status=`, `?channel=` and `?q=` of earlier links are dropped by the schema.
 */
export const publicationsSearchSchema = z.object({
  view: publicationViewSchema.optional().catch(undefined),
  post: z.uuid().optional().catch(undefined),
  order: z.enum(['asc', 'desc']).optional().catch(undefined),
  id: z.uuid().optional().catch(undefined)
});
export type PublicationsSearch = z.infer<typeof publicationsSearchSchema>;
