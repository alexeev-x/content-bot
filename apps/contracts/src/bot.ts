import { z } from 'zod';

// The bot's connection to Telegram, as the owner sees it in Settings → Бот. The Worker registers
// its own webhook with the token and secret it already holds, so no secret ever leaves Cloudflare.

// Names of the Worker settings the bot needs; values are never sent.
export const botSettingSchema = z.enum([
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_WEBHOOK_SECRET',
  'BOT_INFO',
  'OWNER_TELEGRAM_ID'
]);
export type BotSetting = z.infer<typeof botSettingSchema>;

export const botWebhookSchema = z.object({
  /** Where Telegram sends updates now; null when no webhook is registered. A bot token in it is shown as `***`. */
  url: z.string().nullable(),
  /** The registered URL is this Worker's own `/webhooks/telegram`. */
  pointsHere: z.boolean(),
  pendingUpdateCount: z.number().int().nonnegative(),
  lastErrorAt: z.iso.datetime().nullable(),
  /** Telegram's own text, e.g. "Wrong response from the webhook: 401 Unauthorized". */
  lastErrorMessage: z.string().nullable()
});
export type BotWebhookDto = z.infer<typeof botWebhookSchema>;

export const botStatusSchema = z.object({
  /** Settings that are missing or malformed on this Worker; empty when the bot can run. */
  missing: z.array(botSettingSchema),
  botUsername: z.string().nullable(),
  /** The URL this Worker would register: its origin + `/webhooks/telegram`. */
  expectedUrl: z.string(),
  /** Null while `missing` is not empty: Telegram is then not asked. */
  webhook: botWebhookSchema.nullable()
});
export type BotStatusDto = z.infer<typeof botStatusSchema>;

// GET /api/v1/bot/status → 200 BotStatusDto. Reads Telegram's getWebhookInfo; changes nothing.
// POST /api/v1/bot/connect, body {} → 200 BotStatusDto after: setWebhook (this Worker's URL, its
// secret, drop_pending_updates, allowed_updates message+callback_query), removal of stale command
// lists, owner-chat commands and the menu button. Safe to repeat: every step sets the same values.
// Errors (both): UNAVAILABLE 503 (Telegram unreachable or answered unexpectedly; for connect also
// when `missing` is not empty, details.reason BOT_NOT_CONFIGURED), RATE_LIMIT 429 (Retry-After),
// UNAUTHORIZED 401, FORBIDDEN 403; connect also VALIDATION_ERROR 400/413.
export const connectBotInputSchema = z.strictObject({});
export type ConnectBotInput = z.infer<typeof connectBotInputSchema>;
