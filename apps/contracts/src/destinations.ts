import { z } from 'zod';
import { pageQuerySchema, pageSchema } from './pagination';
import { cleanText } from './text';

// A Telegram channel or group the bot publishes to.
export const destinationKindSchema = z.enum(['channel', 'group']);
export type DestinationKind = z.infer<typeof destinationKindSchema>;

export const DESTINATION_TITLE_MAX = 100;

const titleSchema = z
  .string()
  .trim()
  .min(1, { error: 'Title is required' })
  .max(DESTINATION_TITLE_MAX)
  .refine(cleanText(false), { error: 'Title contains forbidden characters' });
// Numeric chat id without leading zeros (e.g. -1001234567890, at most 19 digits) or a public @username,
// so one Telegram chat has exactly one spelling.
const chatIdSchema = z
  .string()
  .trim()
  .regex(/^(-?[1-9]\d{0,18}|@[A-Za-z][A-Za-z0-9_]{4,31})$/, { error: 'Invalid Telegram chat id' });
const revisionSchema = z.number().int().nonnegative();

export const destinationSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  chatId: z.string(),
  kind: destinationKindSchema,
  enabled: z.boolean(),
  revision: revisionSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime()
});
export type DestinationDto = z.infer<typeof destinationSchema>;

// POST /api/v1/destinations, header Idempotency-Key (required) → 201 DestinationDto (revision 0, enabled).
// Errors: VALIDATION_ERROR 400 or 413, CONFLICT 409 (details.reason CHAT_ID_TAKEN |
// IDEMPOTENCY_KEY_REUSED | IN_FLIGHT), UNAUTHORIZED 401, FORBIDDEN 403.
export const createDestinationInputSchema = z.strictObject({
  title: titleSchema,
  chatId: chatIdSchema,
  kind: destinationKindSchema
});
export type CreateDestinationInput = z.infer<typeof createDestinationInputSchema>;

// PATCH /api/v1/destinations/{id} → 200 DestinationDto with revision + 1.
// chatId changes when Telegram migrates a group to a supergroup. Disabling keeps already
// scheduled publications; new ones are refused.
// Errors: VALIDATION_ERROR 400 or 413, NOT_FOUND 404, CONFLICT 409 (details.reason
// STALE_REVISION | CHAT_ID_TAKEN), UNAUTHORIZED 401, FORBIDDEN 403.
export const updateDestinationInputSchema = z
  .strictObject({
    revision: revisionSchema,
    title: titleSchema.optional(),
    chatId: chatIdSchema.optional(),
    enabled: z.boolean().optional()
  })
  .refine((input) => input.title !== undefined || input.chatId !== undefined || input.enabled !== undefined, {
    error: 'Nothing to update'
  });
export type UpdateDestinationInput = z.infer<typeof updateDestinationInputSchema>;

// GET /api/v1/destinations?enabled&cursor&limit → 200 DestinationPageDto, ordered by title.
// GET /api/v1/destinations/{id} → 200 DestinationDto or NOT_FOUND 404.
// Errors: VALIDATION_ERROR 400, UNAUTHORIZED 401, FORBIDDEN 403.
export const listDestinationsQuerySchema = pageQuerySchema.extend({
  enabled: z.enum(['true', 'false']).optional()
});
export type ListDestinationsQuery = z.infer<typeof listDestinationsQuerySchema>;

export const destinationPageSchema = pageSchema(destinationSchema);
export type DestinationPageDto = z.infer<typeof destinationPageSchema>;
