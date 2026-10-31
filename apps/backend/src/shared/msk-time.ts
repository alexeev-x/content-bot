// Moscow time for the rubric scheduler and the rubrics: UTC+3 all year (no daylight saving since 2014), so plain
// arithmetic, no Intl. Stored times stay UTC ms; a Moscow day is `YYYY-MM-DD`.

export const MSK_OFFSET_MS = 3 * 3_600_000;
const DAY_MS = 86_400_000;

/** The UTC instant the Moscow day holding `utc` starts at (21:00 UTC the day before). */
export function mskDayStart(utc: number): number {
  return Math.floor((utc + MSK_OFFSET_MS) / DAY_MS) * DAY_MS - MSK_OFFSET_MS;
}

/** Whole Moscow days since 1970-01-01. */
export function mskDayIndex(utc: number): number {
  return Math.floor((utc + MSK_OFFSET_MS) / DAY_MS);
}

/** 0 Sunday … 6 Saturday, in Moscow. */
export function mskWeekday(utc: number): number {
  return new Date(utc + MSK_OFFSET_MS).getUTCDay();
}

/** The Moscow calendar date and clock of `utc`. */
export function mskParts(utc: number): { day: string; hour: number; minute: number; weekday: number } {
  const shifted = new Date(utc + MSK_OFFSET_MS);
  return {
    day: shifted.toISOString().slice(0, 10),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    weekday: shifted.getUTCDay()
  };
}

/** Moscow days from `a` to `b` (negative when `b` is earlier). */
export function mskDaysBetween(a: number, b: number): number {
  return mskDayIndex(b) - mskDayIndex(a);
}
