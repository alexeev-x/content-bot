import { z } from 'zod';

// User-facing projection of internal job states (docs/BACKEND_ARCHITECTURE.md §5).
export const publicationStatusSchema = z.enum([
  'scheduled',
  'queued',
  'preparing',
  'sending',
  'sent',
  'retry_wait',
  'failed',
  'unknown',
  'cancelled',
]);
export type PublicationStatus = z.infer<typeof publicationStatusSchema>;
