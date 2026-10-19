// Forecasts of a video's total views (plan P5, §5): deterministic and transparent, computed by code from stored
// readings only; a model may explain them in words but never makes the numbers. Every function takes the
// forecast's origin `t` and reads nothing after it, so a backtest at a historical `t` sees what was known then.

const HOUR_MS = 60 * 60 * 1000;
export const FORECAST_HORIZONS_HOURS = [24, 72, 168] as const;
export type ForecastHorizon = (typeof FORECAST_HORIZONS_HOURS)[number];
/** Bump on any change of the method or its constants: accuracy is kept per version. */
export const FORECAST_METHOD = 'decay-v1';

/** Too few or too old readings make no forecast (FC-02, FC-03). */
const MIN_READINGS = 3;
const RECENT_MS = 48 * HOUR_MS;
const STALE_YOUNG_MS = 3 * HOUR_MS;
const STALE_OLD_MS = 26 * HOUR_MS;
const YOUNG_MS = 72 * HOUR_MS;
/** The rate is read over the reading closest to this long before the latest one, at least `RATE_MIN_MS`. */
const RATE_WINDOW_MS = 24 * HOUR_MS;
const RATE_MIN_MS = 6 * HOUR_MS;
/**
 * The band around the expected growth: wide by design (a Shorts video can take off or stall), wider with
 * fewer readings. These factors are what the backtest calibrates; a change means a new `FORECAST_METHOD`.
 */
const BAND_LOW = 0.4;
const BAND_HIGH = 2.2;
const BAND_FEW_READINGS = 6;
const BAND_FEW_LOW = 0.25;
const BAND_FEW_HIGH = 3;
/** No growth beyond this many times the current views within a horizon: an impossible jump is clamped. */
const MAX_GROWTH_FACTOR = 20;

export interface ForecastReading {
  observedAt: number;
  views: number | null;
}

export type Forecast =
  | {
      quality: 'ok';
      method: string;
      origin: number;
      /** The latest reading the forecast starts from. */
      baseViews: number;
      baseAt: number;
      /** Views per hour over the rate window, and that window's real length. */
      rate: number;
      rateHours: number;
      readings: number;
      horizons: { hours: ForecastHorizon; at: number; expected: number; low: number; high: number }[];
    }
  | {
      quality: 'insufficient_data';
      method: string;
      origin: number;
      reason: 'too_few_readings' | 'stale' | 'counter_drop' | 'no_rate_window';
    };

function usableUpTo(readings: readonly ForecastReading[], origin: number) {
  return readings
    .filter((row): row is { observedAt: number; views: number } => row.views !== null && row.observedAt <= origin)
    .sort((a, b) => a.observedAt - b.observedAt);
}

/**
 * Views gained over `hours` after age `ageHours` at a rate that falls as 1/age (a short video's views slow down
 * as it ages): rate·age·ln((age + h) / age). Transparent, one assumption, no fitted curve.
 */
function decayedGain(rate: number, ageHours: number, hours: number): number {
  const age = Math.max(ageHours, 1);
  return rate * age * Math.log((age + hours) / age);
}

export function forecastViews(input: {
  readings: readonly ForecastReading[];
  publishedAt: number;
  origin: number;
}): Forecast {
  const { origin } = input;
  const method = FORECAST_METHOD;
  const known = usableUpTo(input.readings, origin);
  const recent = known.filter((row) => row.observedAt >= origin - RECENT_MS);
  if (recent.length < MIN_READINGS) return { quality: 'insufficient_data', method, origin, reason: 'too_few_readings' };
  const latest = recent.at(-1)!;
  const ageMs = Math.max(0, latest.observedAt - input.publishedAt);
  if (origin - latest.observedAt > (ageMs < YOUNG_MS ? STALE_YOUNG_MS : STALE_OLD_MS))
    return { quality: 'insufficient_data', method, origin, reason: 'stale' };
  // A recount or removed views make any rate meaningless.
  if (recent.some((row, index) => index > 0 && row.views < recent[index - 1]!.views))
    return { quality: 'insufficient_data', method, origin, reason: 'counter_drop' };
  const candidates = recent.filter((row) => latest.observedAt - row.observedAt >= RATE_MIN_MS);
  const start = candidates.reduce<(typeof candidates)[number] | null>(
    (best, row) =>
      best === null ||
      Math.abs(latest.observedAt - row.observedAt - RATE_WINDOW_MS) <
        Math.abs(latest.observedAt - best.observedAt - RATE_WINDOW_MS)
        ? row
        : best,
    null
  );
  if (start === null) return { quality: 'insufficient_data', method, origin, reason: 'no_rate_window' };
  const rateHours = (latest.observedAt - start.observedAt) / HOUR_MS;
  const rate = (latest.views - start.views) / rateHours;
  const few = recent.length < BAND_FEW_READINGS;
  const ageHours = ageMs / HOUR_MS;
  return {
    quality: 'ok',
    method,
    origin,
    baseViews: latest.views,
    baseAt: latest.observedAt,
    rate: Math.round(rate),
    rateHours: Math.round(rateHours),
    readings: recent.length,
    horizons: FORECAST_HORIZONS_HOURS.map((hours) => {
      // The horizon counts from the origin; the gap from the latest reading to it is forecast too.
      const at = origin + hours * HOUR_MS;
      const span = (at - latest.observedAt) / HOUR_MS;
      const cap = latest.views * (MAX_GROWTH_FACTOR - 1);
      const gain = Math.min(decayedGain(rate, ageHours, span), cap);
      return {
        hours,
        at,
        expected: Math.round(latest.views + gain),
        low: Math.round(latest.views + gain * (few ? BAND_FEW_LOW : BAND_LOW)),
        high: Math.round(latest.views + Math.min(gain * (few ? BAND_FEW_HIGH : BAND_HIGH), cap))
      };
    })
  };
}

/**
 * The simple methods the decay method must beat (plan §5): views stay as they are, or the current rate goes on
 * unchanged. Point forecasts only; they give the error to compare, not a band.
 */
export function naiveForecasts(
  readings: readonly ForecastReading[],
  origin: number,
  hours: ForecastHorizon
): { flat: number; linear: number } | null {
  const known = usableUpTo(readings, origin);
  const latest = known.at(-1);
  if (latest === undefined) return null;
  const start = known.filter((row) => latest.observedAt - row.observedAt >= RATE_MIN_MS).at(-1);
  const rate =
    start === undefined ? 0 : (latest.views - start.views) / ((latest.observedAt - start.observedAt) / HOUR_MS);
  const span = (origin + hours * HOUR_MS - latest.observedAt) / HOUR_MS;
  return { flat: latest.views, linear: Math.round(latest.views + Math.max(0, rate) * span) };
}
