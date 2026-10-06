import { z } from 'zod';
import { cleanText } from './text';

// Owner appearance settings, stored on the server so the browser and the Mini App match
// (owner decision 06.10.2026, docs/DESIGN_SYSTEM_NO_FIGMA.md § Approved visual direction).

export const accentPresetIdSchema = z.enum(['cobalt', 'indigo', 'copper', 'orchid', 'mono']);
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
