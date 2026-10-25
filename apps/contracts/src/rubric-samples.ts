import { z } from 'zod';

/**
 * POST /api/v1/rubric-samples (DEV only, owner 25.10.2026): builds one rubric's post from live data (OpenDota) the way
 * the channel would show it — the picture rendered by Cloudflare Browser Rendering from Valve's real icons, the text,
 * the poll — and sends it to the owner's chat with the bot only, never to a channel. No AI call.
 * Errors: VALIDATION_ERROR 400, UNAUTHORIZED 401, FORBIDDEN 403 (details.reason RUBRIC_SAMPLES_OFF where the Worker
 * does not allow it), RATE_LIMIT 429, UNAVAILABLE 503 (the bot, the owner's chat, the browser or OpenDota).
 */
export const rubricSampleKeySchema = z.enum([
  'rank_meta',
  'who_beats_whom',
  'anti_build',
  'guess_winrate',
  'daily_record',
  'whose_ability'
]);
export type RubricSampleKey = z.infer<typeof rubricSampleKeySchema>;
export const sendRubricSampleInputSchema = z.strictObject({ rubric: rubricSampleKeySchema });
export type SendRubricSampleInput = z.infer<typeof sendRubricSampleInputSchema>;
export const sendRubricSampleResponseSchema = z.object({
  rubric: rubricSampleKeySchema,
  /** Telegram messages sent: a picture or text, then a poll when the rubric has one. */
  messages: z.number().int().min(1).max(3),
  picture: z.boolean()
});
export type SendRubricSampleResponse = z.infer<typeof sendRubricSampleResponseSchema>;
