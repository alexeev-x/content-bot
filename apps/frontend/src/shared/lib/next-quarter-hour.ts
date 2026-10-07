import type { ZonedDateTime } from '@internationalized/date';

/** The next quarter-hour strictly after the given instant, including across midnight and DST. */
export function nextQuarterHour(from: ZonedDateTime): ZonedDateTime {
  const minutes = 15 - (from.minute % 15);
  return from.set({ second: 0, millisecond: 0 }).add({ minutes });
}
