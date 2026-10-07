import { incidentKindSchema, incidentStateSchema } from '@alexeev/contracts';
import { z } from 'zod';

/** URL state of /incidents: `?state=open|resolved&kind=...`. `.catch` keeps a hand-edited URL usable. */
export const incidentsSearchSchema = z.object({
  state: incidentStateSchema.catch('open').default('open'),
  kind: incidentKindSchema.optional().catch(undefined)
});
export type IncidentsSearch = z.infer<typeof incidentsSearchSchema>;
