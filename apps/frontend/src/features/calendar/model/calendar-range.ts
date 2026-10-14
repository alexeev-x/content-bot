import { CalendarDate, CalendarDateTime, parseDate, toZoned } from '@internationalized/date';

export type CalendarView = 'day' | 'week' | 'month';

export type CalendarRange = {
  from: string;
  to: string;
  startDate: CalendarDate;
  dayCount: number;
};

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export function parseCalendarDate(value: string | undefined): CalendarDate | null {
  if (!value || !ISO_DAY.test(value)) return null;
  try {
    const date = parseDate(value);
    return date.toString() === value ? date : null;
  } catch {
    return null;
  }
}

function mondayOfWeek(date: CalendarDate): CalendarDate {
  // @internationalized/date uses 0 for Sunday. Calendar weeks begin Monday in this product.
  const weekday = date.toDate('UTC').getUTCDay();
  return date.subtract({ days: (weekday + 6) % 7 });
}

function startDateFor(date: CalendarDate, view: CalendarView): CalendarDate {
  if (view === 'day') return date;
  if (view === 'week') return mondayOfWeek(date);
  return mondayOfWeek(date.set({ day: 1 }));
}

function startOfLocalDay(date: CalendarDate, timeZone: string): string {
  const localMidnight = new CalendarDateTime(date.year, date.month, date.day);
  return toZoned(localMidnight, timeZone, 'compatible').toDate().toISOString();
}

/** Visible range in the owner's timezone, represented as a half-open UTC interval. */
export function calendarRange(date: CalendarDate, view: CalendarView, timeZone: string): CalendarRange {
  const startDate = startDateFor(date, view);
  const dayCount = view === 'day' ? 1 : view === 'week' ? 7 : 42;
  const endDate = startDate.add({ days: dayCount });
  return {
    from: startOfLocalDay(startDate, timeZone),
    to: startOfLocalDay(endDate, timeZone),
    startDate,
    dayCount
  };
}

export function shiftCalendarDate(date: CalendarDate, view: CalendarView, direction: -1 | 1): CalendarDate {
  if (view === 'day') return date.add({ days: direction });
  if (view === 'week') return date.add({ days: direction * 7 });
  return date.add({ months: direction });
}

export function calendarDays(range: CalendarRange): CalendarDate[] {
  return Array.from({ length: range.dayCount }, (_, index) => range.startDate.add({ days: index }));
}
