import type { PublicationDto } from '@alexeev/contracts';
import { ownerDayRanges, ownerDaysRange } from '../../../shared/lib/owner-timezone';

export const WEEK_DAYS = 7;

export type DayRange = { from: string; to: string };
export type WeekDay = { start: Date; from: string; to: string; count: number; isToday: boolean };

/** The UTC instants of the 7 local days starting with the day containing `now`. */
export function weekRange(now: Date, timeZone = 'Europe/Moscow'): DayRange {
  const days = ownerDayRanges(now, timeZone, WEEK_DAYS);
  return {
    from: days[0]?.from ?? ownerDaysRange(now, timeZone, WEEK_DAYS).from,
    to: days.at(-1)?.to ?? ownerDaysRange(now, timeZone, WEEK_DAYS).to
  };
}

/** Scheduled publications per local day; days with nothing stay in the list with a zero. */
export function weekDays(
  items: readonly Pick<PublicationDto, 'scheduledAt'>[],
  now: Date,
  timeZone = 'Europe/Moscow'
): WeekDay[] {
  const days = ownerDayRanges(now, timeZone, WEEK_DAYS).map((range, index) => ({
    start: new Date(range.from),
    ...range,
    count: 0,
    isToday: index === 0
  }));
  for (const item of items) {
    const at = Date.parse(item.scheduledAt);
    const index = days.findIndex((day) => at >= Date.parse(day.from) && at < Date.parse(day.to));
    if (index >= 0) days[index] = { ...(days[index] as WeekDay), count: (days[index] as WeekDay).count + 1 };
  }
  return days;
}
