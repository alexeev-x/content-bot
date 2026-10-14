import type { PublicationDto } from '@alexeev/contracts';
import { ownerDayRange, ownerDayRanges } from '../../../shared/lib/owner-timezone';

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export type WeekDay = {
  from: string;
  to: string;
  /** «Пн». */
  short: string;
  /** «понедельник, 13 октября»: the accessible name of the bar. */
  long: string;
  isToday: boolean;
};

export type DayCount = { scheduled: number; sent: number; problem: number };

/** Monday to Sunday of the owner-zone week containing `now`; the reference sits at midday so a DST shift never changes the date. */
export function weekDays(now: Date, timeZone: string): WeekDay[] {
  const today = ownerDayRange(now, timeZone);
  const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone }).format(now);
  const sinceMonday = Math.max(0, WEEKDAYS.indexOf(weekday));
  const monday = new Date(Date.parse(today.from) + DAY_MS / 2 - sinceMonday * DAY_MS);
  const short = new Intl.DateTimeFormat('ru-RU', { weekday: 'short', timeZone });
  const long = new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long', timeZone });
  return ownerDayRanges(monday, timeZone, 7).map((range) => {
    const middle = new Date((Date.parse(range.from) + Date.parse(range.to)) / 2);
    const label = short.format(middle);
    return {
      ...range,
      short: `${label.charAt(0).toUpperCase()}${label.slice(1)}`,
      long: long.format(middle),
      isToday: range.from === today.from
    };
  });
}

export function weekRange(now: Date, timeZone: string): { from: string; to: string } {
  const days = weekDays(now, timeZone);
  return { from: days[0]!.from, to: days[6]!.to };
}

/** Scheduled vs sent vs trouble per day; cancelled publications are not part of any bar. */
export function countByDay(items: readonly Pick<PublicationDto, 'status' | 'scheduledAt'>[], days: readonly WeekDay[]) {
  const counts: DayCount[] = days.map(() => ({ scheduled: 0, sent: 0, problem: 0 }));
  for (const item of items) {
    if (item.status === 'cancelled') continue;
    const at = Date.parse(item.scheduledAt);
    const index = days.findIndex((day) => at >= Date.parse(day.from) && at < Date.parse(day.to));
    const bucket = counts[index];
    if (!bucket) continue;
    if (item.status === 'sent') bucket.sent += 1;
    else if (item.status === 'failed' || item.status === 'unknown') bucket.problem += 1;
    else bucket.scheduled += 1;
  }
  return counts;
}
