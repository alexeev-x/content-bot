import { z } from 'zod';
import { rubricKeySchema } from './rubric-keys';

/**
 * POST /api/v1/lab/rubrics («Тестирование», a DEV-only build, owner 25.10.2026): builds one rubric's post from live data (dotaconstants, Valve's datafeed, Steam, the game-files tracker, STRATZ) the way
 * the channel would show it — the picture rendered by Cloudflare Browser Rendering from Valve's real icons, the text,
 * the poll — and sends it to the owner's chat with the bot only, never to a channel.
 * Errors: VALIDATION_ERROR 400, UNAUTHORIZED 401, NOT_FOUND 404 in a production build (the route is not there),
 * RATE_LIMIT 429, UNAVAILABLE 503 (the bot, the owner's chat, the browser, a data source; STATS_NOT_CONFIGURED until
 * STRATZ_TOKEN is set).
 */
export const rubricSampleKeySchema = rubricKeySchema;
export type RubricSampleKey = z.infer<typeof rubricSampleKeySchema>;
export const sendRubricSampleInputSchema = z.strictObject({ rubric: rubricSampleKeySchema });
export type SendRubricSampleInput = z.infer<typeof sendRubricSampleInputSchema>;
/** 202: the sample is queued; the bot sends the AI's post with pictures A and B to the owner within minutes. */
export const sendRubricSampleResponseSchema = z.object({
  rubric: rubricSampleKeySchema,
  queued: z.literal(true)
});
export type SendRubricSampleResponse = z.infer<typeof sendRubricSampleResponseSchema>;
