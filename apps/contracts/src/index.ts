import { z } from 'zod';
export const apiErrorSchema = z.object({ error:z.object({code:z.enum(['UNAUTHORIZED','FORBIDDEN','VALIDATION_ERROR','CONFLICT','NOT_FOUND','RATE_LIMIT','UNAVAILABLE','UNKNOWN_SEND_RESULT']),message:z.string(),requestId:z.string(),details:z.record(z.string(),z.string()).optional()}) });
export const postSchema = z.object({id:z.uuid(),title:z.string(),body:z.string(),revision:z.number().int().nonnegative(),status:z.enum(['draft','approved','scheduled']),updatedAt:z.iso.datetime()});
export const publicationStatusSchema=z.enum(['scheduled','queued','preparing','sending','sent','retry_wait','failed','unknown','cancelled']);
export type PostDto=z.infer<typeof postSchema>;
export type PublicationStatus=z.infer<typeof publicationStatusSchema>;
