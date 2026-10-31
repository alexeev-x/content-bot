import { RUBRIC_KEYS, RUBRIC_META, RUBRIC_TITLES } from '../modules/rubrics';
import type { Need, RubricDescriptor } from '../modules/rubric-scheduler';
import type { AppEnv } from './env';

// The scheduler's view of the rubrics (it never imports the rubrics module) and what this Worker can run.

export function rubricDescriptors(): RubricDescriptor[] {
  return RUBRIC_KEYS.map((key) => {
    const meta = RUBRIC_META[key];
    return {
      key,
      title: RUBRIC_TITLES[key],
      family: meta.family,
      weight: meta.weight,
      interactive: meta.interactive,
      trigger: meta.trigger,
      needs: meta.needs,
      restDays: meta.restDays,
      slot: meta.slot,
      sameDay: meta.sameDay,
      sameWeek: meta.sameWeek ?? [],
      apart: meta.apart ?? [],
      silentAfterPatchDays: meta.silentAfterPatchDays ?? null,
      hasPicture: meta.weight !== 'L' || meta.browserCalls > 0,
      hasPoll: meta.poll !== undefined
    };
  });
}

const NEEDS: readonly Need[] = ['browser', 'ai_text', 'ai_image', 'ai_upscale', 'stratz', 'stats_db'];

/**
 * What this Worker can run, from its bindings and secrets. `FORECAST_CAPABILITIES` (a DEV var, comma list) overrides
 * it, so DEV can show the forecast production would have.
 */
export function rubricCapabilities(env: AppEnv): Set<Need> {
  const override = env.FORECAST_CAPABILITIES?.trim();
  if (override !== undefined && override !== '') {
    return new Set(
      override
        .split(',')
        .map((need) => need.trim())
        .filter((need): need is Need => (NEEDS as string[]).includes(need))
    );
  }
  const capabilities = new Set<Need>();
  if ((env as { BROWSER?: unknown }).BROWSER !== undefined) capabilities.add('browser');
  if ((env.OPENAI_API_KEY ?? '') !== '') {
    capabilities.add('ai_text');
    capabilities.add('ai_image');
    capabilities.add('ai_upscale');
  }
  if ((env.STRATZ_TOKEN ?? '') !== '' && (env.STATS_BRIDGE_URL ?? '') !== '') capabilities.add('stratz');
  if ((env as { STATS_DB?: unknown }).STATS_DB !== undefined) capabilities.add('stats_db');
  return capabilities;
}
