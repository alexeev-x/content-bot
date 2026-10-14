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
  // Added 14.10.2026; a document saved before has neither, so both default to on.
  /** «Запланировано», «Перенесено» and «Отменено» notices for the owner's own planning. */
  scheduleNotices: z.boolean().default(true),
  /** «Опубликовано» after a confirmed send. */
  sentNotices: z.boolean().default(true)
});

export const ownerOperationsSettingsSchema = z.object({
  timezone: ownerTimeZoneSchema,
  notifications: notificationPreferencesSchema,
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
  notifications: notificationPreferencesSchema
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
