// A schedule may sit slightly in the past ("send now" from a form that was open for a while)
// and at most a year and a day ahead.
export const SCHEDULE_PAST_GRACE_MS = 5 * 60 * 1000;
export const SCHEDULE_MAX_AHEAD_MS = 366 * 24 * 60 * 60 * 1000;

/** Both arguments are UTC epoch milliseconds; the bounds are inclusive. */
export function isInScheduleWindow(scheduledAt: number, now: number): boolean {
  return (
    Number.isFinite(scheduledAt) &&
    scheduledAt >= now - SCHEDULE_PAST_GRACE_MS &&
    scheduledAt <= now + SCHEDULE_MAX_AHEAD_MS
  );
}
