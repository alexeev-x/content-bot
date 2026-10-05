import { z } from 'zod';

export const apiErrorCodeSchema = z.enum([
  'UNAUTHORIZED',
  'FORBIDDEN',
  'VALIDATION_ERROR',
  'CONFLICT',
  'NOT_FOUND',
  'RATE_LIMIT',
  'UNAVAILABLE',
  'UNKNOWN_SEND_RESULT'
]);
export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;

export const apiErrorSchema = z.object({
  error: z.object({
    code: apiErrorCodeSchema,
    message: z.string(),
    requestId: z.string(),
    details: z.record(z.string(), z.string()).optional()
  })
});
export type ApiErrorDto = z.infer<typeof apiErrorSchema>;
