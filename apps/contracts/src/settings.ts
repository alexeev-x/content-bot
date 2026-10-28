import { z } from 'zod';
import { cleanText } from './text';

function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export const ownerTimeZoneSchema = z.string().trim().min(1).max(100).refine(isTimeZone, {
  error: 'Use a valid IANA time zone'
});

export const notificationPreferencesSchema = z.object({
  warningsEnabled: z.boolean(),
  publicationAlerts: z.boolean(),
  sourceAlerts: z.boolean(),
  automationAlerts: z.boolean(),
  recoveryAlerts: z.boolean(),
  dotaWatchlistAlerts: z.boolean(),
  // Added 14.10.2026; off unless the owner switches them on (owner, 22.10.2026: only errors reach the bot).
  /** «Запланировано», «Перенесено» and «Отменено» notices for the owner's own planning. */
  scheduleNotices: z.boolean().default(false),
  /** «Опубликовано» after a confirmed send. */
  sentNotices: z.boolean().default(false),
  // Added 19.10.2026 (AI plan P6): the daily analytics report is off until the owner switches it on.
  /** The daily report of the six latest videos per platform, in the owner's private chat. */
  dailyReport: z.boolean().default(false),
  /** The owner-zone hour it is sent at. */
  dailyReportHour: z.number().int().min(0).max(23).default(9),
  // Added 25.10.2026 (owner: «почти на каждое действие уведомление, чтобы мог выключить, кроме критических»); on as
  // before, each its own switch.
  /** «Новость пришла»: a source's new event with its draft and publish buttons (sourceAlerts keeps the failures). */
  draftOffers: z.boolean().default(true),
  /** The Monday report of the week. */
  weeklyReport: z.boolean().default(true),
  /** A publication off its usual curve, a source outage of the analytics. */
  contentAlerts: z.boolean().default(true),
  /** The AI's review of a new video. */
  aiReviews: z.boolean().default(true),
  /** «Снят по этому сценарию?» after a video. */
  scriptPrompts: z.boolean().default(true),
  /** The AI's style lessons from the owner's edits («✅ Учитывать / Нет»). */
  aiLearning: z.boolean().default(true)
});

/**
 * DEV only (owner, 25.10.2026: «на дев убрать кроны, чтобы не тратилось»): the Cron's background work, all off until
 * the owner switches a job on. Publishing, reconcile and cleanup always run. Production ignores this and runs all.
 */
export const BACKGROUND_JOBS = [
  'sources',
  'gameFiles',
  'heroMatches',
  'contentAnalytics',
  'reports',
  'contentAlerts',
  'aiReviews',
  'scriptPrompts',
  'aiLearning'
] as const;
export type BackgroundJob = (typeof BACKGROUND_JOBS)[number];
export const backgroundSettingsSchema = z.object({
  /** The master switch: off stops every job below, whatever its own switch says. */
  enabled: z.boolean(),
  jobs: z.object({
    sources: z.boolean().default(false),
    gameFiles: z.boolean().default(false),
    /** The «Гайд на героя» match base (owner, 28.10.2026: on DEV only when switched on for a test). */
    heroMatches: z.boolean().default(false),
    contentAnalytics: z.boolean().default(false),
    reports: z.boolean().default(false),
    contentAlerts: z.boolean().default(false),
    aiReviews: z.boolean().default(false),
    scriptPrompts: z.boolean().default(false),
    aiLearning: z.boolean().default(false)
  })
});
export type BackgroundSettings = z.infer<typeof backgroundSettingsSchema>;
export const BACKGROUND_DEFAULTS: BackgroundSettings = {
  enabled: false,
  jobs: {
    sources: false,
    gameFiles: false,
    heroMatches: false,
    contentAnalytics: false,
    reports: false,
    contentAlerts: false,
    aiReviews: false,
    scriptPrompts: false,
    aiLearning: false
  }
};

/**
 * Valve's news published without the owner (owner, 21–22.10.2026: «он должен автоматом публиковать, ибо я спать буду»).
 * Off until the owner switches it on and picks the channel; at most `dailyLimit` such posts in 24 h, the rest wait for
 * the owner as drafts. Switching it off is the stop button.
 */
export const AUTOPUBLISH_DAILY_LIMIT_MAX = 100;
export const autopublishSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  destinationId: z.uuid().nullable().default(null),
  // Typed by the owner, not picked from ten (owner, 23.10.2026: «могу увеличить до 30»).
  dailyLimit: z.number().int().min(1).max(AUTOPUBLISH_DAILY_LIMIT_MAX).default(3)
});
export type AutopublishSettings = z.infer<typeof autopublishSettingsSchema>;

// GET /api/v1/settings/autopublish/activity -> 200 AutopublishActivityDto (owner, 24.10.2026: what went out without
// the owner and what was held, and why). Read-only; errors: UNAUTHORIZED, FORBIDDEN, UNAVAILABLE.
export const autopublishSourceSchema = z.enum(['event', 'game_files', 'steam', 'series']);
export type AutopublishSource = z.infer<typeof autopublishSourceSchema>;
/** Why a post did not go out by itself; the owner got it as a draft or a note instead. */
export const autopublishHeldReasonSchema = z.enum([
  'off',
  'channel',
  'limit',
  'too_long',
  'link',
  'no_images',
  'failed'
]);
export type AutopublishHeldReason = z.infer<typeof autopublishHeldReasonSchema>;
export const autopublishActivityItemSchema = z.object({
  id: z.uuid(),
  at: z.iso.datetime(),
  source: autopublishSourceSchema,
  title: z.string().max(300),
  outcome: z.enum(['published', 'held']),
  /** Null when published; an unknown stored reason reads as `failed`. */
  reason: autopublishHeldReasonSchema.nullable(),
  postId: z.uuid().nullable()
});
export type AutopublishActivityItemDto = z.infer<typeof autopublishActivityItemSchema>;
export const autopublishActivitySchema = z.object({
  enabled: z.boolean(),
  dailyLimit: z.number().int().min(1).max(AUTOPUBLISH_DAILY_LIMIT_MAX),
  /** Publications the automatic publishing created in the last 24 hours: what the limit counts. */
  usedToday: z.number().int().nonnegative(),
  /** The last 24 hours, newest first. */
  items: z.array(autopublishActivityItemSchema).max(50)
});
export type AutopublishActivityDto = z.infer<typeof autopublishActivitySchema>;
export const AUTOPUBLISH_DEFAULTS: AutopublishSettings = { enabled: false, destinationId: null, dailyLimit: 3 };

export const ownerOperationsSettingsSchema = z.object({
  timezone: ownerTimeZoneSchema,
  notifications: notificationPreferencesSchema,
  // A document saved before 22.10.2026 has none: off.
  autopublish: autopublishSettingsSchema.default(AUTOPUBLISH_DEFAULTS),
  // A document saved before 25.10.2026 has none: everything off (it only acts on DEV).
  background: backgroundSettingsSchema.default(BACKGROUND_DEFAULTS),
  revision: z.number().int().nonnegative(),
  updatedAt: z.iso.datetime().nullable()
});
export type OwnerOperationsSettingsDto = z.infer<typeof ownerOperationsSettingsSchema>;

// GET /api/v1/settings/operations → 200 OwnerOperationsSettingsDto (default timezone Europe/Moscow,
// notifications enabled, revision 0 when never saved). PUT replaces the document using its revision.
// CRITICAL alerts are always enabled; warningsEnabled only controls WARNING notifications.
// Errors: VALIDATION_ERROR 400, CONFLICT 409 (STALE_REVISION), UNAUTHORIZED 401, FORBIDDEN 403.
export const updateOwnerOperationsSettingsInputSchema = z.strictObject({
  revision: z.number().int().nonnegative(),
  timezone: ownerTimeZoneSchema,
  notifications: notificationPreferencesSchema,
  /** Absent: kept as saved (a client from before 22.10.2026). */
  autopublish: autopublishSettingsSchema.optional(),
  /** Absent: kept as saved. */
  background: backgroundSettingsSchema.optional()
});
export type UpdateOwnerOperationsSettingsInput = z.infer<typeof updateOwnerOperationsSettingsInputSchema>;

// Owner appearance settings, stored on the server so the browser and the Mini App match
// (owner decision 06.10.2026, docs/design/README.md).

// Old ids keep their meaning (cobalt = blue, indigo = violet, copper = orange, orchid = pink, mono = graphite).
export const accentPresetIdSchema = z.enum(['cobalt', 'indigo', 'copper', 'orchid', 'mono', 'teal', 'green', 'red']);
export type AccentPresetId = z.infer<typeof accentPresetIdSchema>;

export const themeModeSchema = z.enum(['system', 'light', 'dark']);
export type ThemeMode = z.infer<typeof themeModeSchema>;

export const CUSTOM_PRESETS_MAX = 10;
export const CUSTOM_PRESET_NAME_MAX = 40;

// One base color; the light and dark accent shades are derived from it on the client.
export const customPresetSchema = z.strictObject({
  id: z.uuid(),
  name: z
    .string()
    .trim()
    .min(1, { error: 'Name is required' })
    .max(CUSTOM_PRESET_NAME_MAX)
    .refine(cleanText(false), { error: 'Name contains forbidden characters' }),
  baseColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, { error: 'Use a #RRGGBB color' })
    .transform((hex) => hex.toLowerCase())
});
export type CustomPresetDto = z.infer<typeof customPresetSchema>;

export const accentRefSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('preset'), id: accentPresetIdSchema }),
  z.strictObject({ kind: z.literal('custom'), id: z.uuid() })
]);
export type AccentRef = z.infer<typeof accentRefSchema>;

export const appearanceSchema = z.object({
  themeMode: themeModeSchema,
  lightAccent: accentRefSchema,
  darkAccent: accentRefSchema,
  customPresets: z.array(customPresetSchema).max(CUSTOM_PRESETS_MAX),
  /** 0 while the owner has never saved; the defaults are then cobalt for both themes, system mode. */
  revision: z.number().int().nonnegative(),
  updatedAt: z.iso.datetime().nullable()
});
export type AppearanceDto = z.infer<typeof appearanceSchema>;

// GET /api/v1/settings/appearance → 200 AppearanceDto (defaults with revision 0 when never saved).
// Errors: UNAUTHORIZED 401, FORBIDDEN 403.
//
// PUT /api/v1/settings/appearance → 200 AppearanceDto with revision + 1. Replaces the whole
// document; the current revision travels in the body.
// Errors: VALIDATION_ERROR 400 (details.reason UNKNOWN_CUSTOM_PRESET when an accent points to a
// custom preset that is not in customPresets; DUPLICATE_PRESET_ID) or 413, CONFLICT 409
// (details.reason STALE_REVISION), UNAUTHORIZED 401, FORBIDDEN 403.
export const updateAppearanceInputSchema = z
  .strictObject({
    revision: z.number().int().nonnegative(),
    themeMode: themeModeSchema,
    lightAccent: accentRefSchema,
    darkAccent: accentRefSchema,
    customPresets: z.array(customPresetSchema).max(CUSTOM_PRESETS_MAX)
  })
  .superRefine((input, ctx) => {
    const ids = new Set(input.customPresets.map((preset) => preset.id));
    if (ids.size !== input.customPresets.length) {
      ctx.addIssue({ code: 'custom', message: 'DUPLICATE_PRESET_ID', path: ['customPresets'] });
    }
    for (const key of ['lightAccent', 'darkAccent'] as const) {
      const ref = input[key];
      if (ref.kind === 'custom' && !ids.has(ref.id)) {
        ctx.addIssue({ code: 'custom', message: 'UNKNOWN_CUSTOM_PRESET', path: [key] });
      }
    }
  });
export type UpdateAppearanceInput = z.infer<typeof updateAppearanceInputSchema>;
