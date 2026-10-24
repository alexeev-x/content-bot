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

export const scheduledPublicationCountSchema = z.object({
  destinationId: z.uuid(),
  count: z.number().int().nonnegative()
});
export type ScheduledPublicationCountDto = z.infer<typeof scheduledPublicationCountSchema>;

// GET /api/v1/destinations/{id}/scheduled-count → 200 ScheduledPublicationCountDto. Counts all
// waiting publications (scheduled, queued and retry_wait) from D1 immediately before confirmation;
// excludes in-flight and terminal work. The client must not cache this value for disable confirmation.
// Errors: NOT_FOUND 404, UNAUTHORIZED 401, FORBIDDEN 403.

// POST /api/v1/destinations/check — asks Telegram about a chat before it is saved: its title and
// type, and whether this environment's bot can post there. Nothing is stored; the dialog uses it
// to prefill the form and to refuse a channel the bot cannot publish to.
// → 200 DestinationCheckDto. Errors: VALIDATION_ERROR 400 (details.reason NOT_A_CHANNEL_OR_GROUP for a
// private chat) or 413, NOT_FOUND 404 (details.reason
// CHAT_NOT_FOUND: Telegram does not know the chat or the bot cannot see it), UNAVAILABLE 503 (bot
// token missing or rejected by Telegram, or Telegram unreachable), RATE_LIMIT 429 with Retry-After
// (20 checks per 10 minutes, or Telegram's own retry_after), UNAUTHORIZED 401, FORBIDDEN 403.
export const checkDestinationInputSchema = z.strictObject({
  chatId: chatIdSchema
});
export type CheckDestinationInput = z.infer<typeof checkDestinationInputSchema>;

export const destinationCheckSchema = z.object({
  /** Canonical numeric id from Telegram, safer to store than a @username that can change. */
  chatId: z.string(),
  username: z.string().nullable(),
  title: z.string(),
  kind: destinationKindSchema,
  /** The bot is an administrator (channel) or a member allowed to send messages (group). */
  botCanPost: z.boolean(),
  /** Why the bot cannot post, when botCanPost is false. */
  problem: z.enum(['BOT_NOT_MEMBER', 'BOT_NOT_ADMIN', 'BOT_CANNOT_POST']).nullable(),
  /** Already saved as a destination (same Telegram chat), so creating it again would be a conflict. */
  alreadyAddedId: z.uuid().nullable()
});
export type DestinationCheckDto = z.infer<typeof destinationCheckSchema>;
