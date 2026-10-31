import { addMskDays, fromMsk, mskParts, mskWeekday } from '../../../shared/msk-time';
import { plan } from '../domain/plan';
import type { ForecastSlot, Need } from '../domain/types';
import type { ForecastSources } from './ports';

// The 35-day forecast of «Рубрики» (stage 3): the pure plan over the channel as it is now. Nothing is stored; until the
// scheduler's tables exist every rubric starts from the start-up seed, so the forecast is honest about being a forecast.

export const FORECAST_DAYS = 35;
const LOOKBACK_MS = 7 * 86_400_000;

export interface Forecast {
  from: string;
  until: string;
  computedAt: number;
  days: { date: string; slots: ForecastSlot[] }[];
  /** Rubrics that cannot run on this Worker and what they lack. */
  ineligible: { rubric: string; missing: Need[] }[];
}

/** The first Monday after today: the horoscope's every-other-week rhythm starts there (§13). */
function nextMonday(today: string): string {
  const weekday = mskWeekday(fromMsk(today, 12 * 60));
  return addMskDays(today, ((8 - weekday) % 7) + (weekday === 1 ? 7 : 0));
}

export async function readForecast(deps: { sources: ForecastSources; now: number }): Promise<Forecast> {
  const today = mskParts(deps.now).day;
  const [channel, latestPatchAt] = await Promise.all([
    deps.sources.channelPosts(deps.now - LOOKBACK_MS),
    deps.sources.latestPatchAt()
  ]);
  const result = plan({
    now: deps.now,
    days: FORECAST_DAYS,
    rubrics: deps.sources.rubrics(),
    lastSent: {},
    channel,
    capabilities: deps.sources.capabilities,
    lastHeroPatchAt: latestPatchAt,
    horoscopeAnchorWeek: nextMonday(today)
  });
  const days = Array.from({ length: FORECAST_DAYS }, (_, offset) => addMskDays(today, offset)).map((date) => ({
    date,
    slots: result.slots.filter((slot) => mskParts(slot.at).day === date)
  }));
  return {
    from: today,
    until: addMskDays(today, FORECAST_DAYS - 1),
    computedAt: deps.now,
    days,
    ineligible: result.ineligible
  };
}
