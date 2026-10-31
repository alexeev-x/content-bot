import { RATIO_MAX, RATIO_MIN } from '../constants';

// Guarded arithmetic: a NaN or an infinity never reaches a stored row; it turns into null and drops its component.

export const finite = (value: number | null | undefined): number | null =>
  value !== null && value !== undefined && Number.isFinite(value) ? value : null;

export function median(values: readonly (number | null)[]): number | null {
  const sorted = values.filter((value): value is number => finite(value) !== null).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const middle = sorted.length >> 1;
  return sorted.length % 2 === 1 ? (sorted[middle] ?? null) : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

/** Into [0.1, 10]; null for anything not finite and positive. */
export function clampRatio(value: number | null): number | null {
  const safe = finite(value);
  if (safe === null || safe <= 0) return null;
  return Math.min(RATIO_MAX, Math.max(RATIO_MIN, safe));
}

/** The weighted geometric mean of the present ratios, weights renormalised over them. */
export function weightedGeoMean(parts: readonly { x: number | null; weight: number }[]): number | null {
  let sum = 0;
  let weights = 0;
  for (const part of parts) {
    if (part.x === null || !(part.x > 0)) continue;
    sum += part.weight * Math.log(part.x);
    weights += part.weight;
  }
  return weights === 0 ? null : clampRatio(Math.exp(sum / weights));
}

/** Shrinks a mean of logs toward 0 (the channel's usual post) by `prior` pseudo-posts. */
export function shrunk(logs: readonly number[], prior = 3): number | null {
  const values = logs.filter((value) => Number.isFinite(value));
  if (values.length === 0) return null;
  const sum = values.reduce((total, value) => total + value, 0);
  return Math.exp(sum / (values.length + prior));
}

export const round2 = (value: number | null): number | null => (value === null ? null : Math.round(value * 100) / 100);
