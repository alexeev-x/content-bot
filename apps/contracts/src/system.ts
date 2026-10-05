import { z } from 'zod';

// GET /api/v1/health — public liveness of the Worker; no private data.
export const healthSchema = z.object({
  status: z.literal('ok'),
  service: z.string(),
  publishingEnabled: z.boolean(),
  time: z.iso.datetime()
});
export type HealthDto = z.infer<typeof healthSchema>;
