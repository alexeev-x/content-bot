import type { PublicationDto } from '@alexeev/contracts';

export const WEEK_DAYS = 7;

export type DayRange = { from: string; to: string };
export type WeekDay = { start: Date; count: number; isToday: boolean };

/** The UTC instants of the 7 local days starting with the day containing `now`. */
export function weekRange(now: Date): DayRange {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + WEEK_DAYS);
  return { from: start.toISOString(), to: end.toISOString() };
}

/** Scheduled publications per local day; days with nothing stay in the list with a zero. */
export function weekDays(items: readonly Pick<PublicationDto, 'scheduledAt'>[], now: Date): WeekDay[] {
  const days = Array.from({ length: WEEK_DAYS }, (_, index) => ({
    start: new Date(now.getFullYear(), now.getMonth(), now.getDate() + index),
    count: 0,
    isToday: index === 0
  }));
  const ends = days.map((day) => new Date(day.start.getFullYear(), day.start.getMonth(), day.start.getDate() + 1));
  for (const item of items) {
    const at = Date.parse(item.scheduledAt);
    const index = days.findIndex((day, position) => at >= day.start.getTime() && at < (ends[position]?.getTime() ?? 0));
    if (index >= 0) days[index] = { ...(days[index] as WeekDay), count: (days[index] as WeekDay).count + 1 };
  }
  return days;
}
