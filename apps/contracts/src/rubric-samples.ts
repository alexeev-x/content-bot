import { z } from 'zod';

/**
 * POST /api/v1/rubric-samples (DEV only, owner 25.10.2026): builds one rubric's post from live data (dotaconstants, Valve's datafeed, Steam, the game-files tracker, STRATZ) the way
 * the channel would show it — the picture rendered by Cloudflare Browser Rendering from Valve's real icons, the text,
 * the poll — and sends it to the owner's chat with the bot only, never to a channel. No AI call.
 * Errors: VALIDATION_ERROR 400, UNAUTHORIZED 401, FORBIDDEN 403 (details.reason RUBRIC_SAMPLES_OFF where the Worker
 * does not allow it), RATE_LIMIT 429, UNAVAILABLE 503 (the bot, the owner's chat, the browser, a data source; STATS_NOT_CONFIGURED until
 * STRATZ_TOKEN is set, NOT_BUILT_YET for a rubric that needs more STRATZ data).
 */
export const rubricSampleKeySchema = z.enum([
  'patch_broken',
  'who_is_imba',
  'nerf_or_buff',
  'whose_ability',
  'files_dont_lie',
  'who_gets_nerfed',
  'valve_seriously',
  'valve_time',
  'rate_it',
  'who_beats_whom',
  'guess_by_numbers',
  'guess_winrate',
  'ban_or_pick',
  'rank_meta',
  'poison_for_low',
  'daily_record',
  'hero_peak',
  'anti_build',
  'forgotten_hero',
  'did_you_know',
  'item_exam',
  'tier_list',
  'carry_on_five',
  'combo_math',
  'horoscope',
  'workshop_set',
  'rebus',
  'guess_streak',
  'tier_list_vote',
  'guess_match',
  'fake_item',
  'whose_build'
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
