import { publicationKindSchema } from '@alexeev/contracts';
import { z } from 'zod';

export const publicationViewSchema = z.enum(['all', 'upcoming', 'recent', 'errors']);
export const publicationPeriodSchema = z.enum(['all', 'today', '7d', '30d']);

/** List controls live in the URL so a filtered publication view survives reload and can be shared. */
const publicationsSearchShape = z.object({
  page: z.number().int().min(1).max(1000).optional().catch(1),
  view: publicationViewSchema.optional().catch(undefined),
  period: publicationPeriodSchema.optional().catch(undefined),
  q: z.string().trim().max(200).optional().catch(undefined),
  kind: publicationKindSchema.optional().catch(undefined),
  from: z.iso.datetime().optional().catch(undefined),
  to: z.iso.datetime().optional().catch(undefined),
  post: z.uuid().optional().catch(undefined),
  order: z.enum(['asc', 'desc']).optional().catch(undefined),
  id: z.uuid().optional().catch(undefined),
  /** Opens «Опубликовать серию» with these posts in order (an event series's «Опубликовать серию»). */
  series: z.array(z.uuid()).min(2).max(5).optional().catch(undefined)
});
export const publicationsSearchSchema = z.preprocess((input) => {
  if (typeof input !== 'object' || input === null || !('view' in input) || input.view !== 'today') return input;
  return { ...input, view: undefined, period: 'today' };
}, publicationsSearchShape);
export type PublicationsSearch = z.infer<typeof publicationsSearchSchema>;
export type PublicationView = z.infer<typeof publicationViewSchema>;
export type PublicationPeriod = z.infer<typeof publicationPeriodSchema>;
