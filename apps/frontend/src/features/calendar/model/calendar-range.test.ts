import { CalendarDate } from '@internationalized/date';
import { describe, expect, it } from 'vitest';
import { calendarDays, calendarRange, parseCalendarDate, shiftCalendarDate } from './calendar-range';

describe('calendar range', () => {
  it('rejects invalid URL dates', () => {
    expect(parseCalendarDate(undefined)).toBeNull();
    expect(parseCalendarDate('2026-02-29')).toBeNull();
    expect(parseCalendarDate('2026-2-03')).toBeNull();
    expect(parseCalendarDate('2026-10-13')).toEqual(new CalendarDate(2026, 10, 13));
  });

  it('uses Monday week starts and a fixed six-week month grid', () => {
    const selected = new CalendarDate(2026, 10, 13);
    const week = calendarRange(selected, 'week', 'Europe/Chisinau');
    expect(week.startDate.toString()).toBe('2026-10-12');
    expect(calendarDays(week).map((day) => day.toString())).toHaveLength(7);

    const month = calendarRange(selected, 'month', 'Europe/Chisinau');
    expect(month.startDate.toString()).toBe('2026-09-28');
    expect(calendarDays(month)).toHaveLength(42);
    expect(month.from).toBe('2026-09-27T21:00:00.000Z');
  });

  it('computes half-open day boundaries in the selected timezone across DST', () => {
    const spring = calendarRange(new CalendarDate(2026, 3, 29), 'day', 'Europe/Chisinau');
    expect(spring.from).toBe('2026-03-28T22:00:00.000Z');
    expect(spring.to).toBe('2026-03-29T21:00:00.000Z');

    const fall = calendarRange(new CalendarDate(2026, 10, 25), 'day', 'Europe/Chisinau');
    expect(fall.from).toBe('2026-10-24T21:00:00.000Z');
    expect(fall.to).toBe('2026-10-25T22:00:00.000Z');
  });

  it('shifts by view-sized calendar periods without using elapsed UTC hours', () => {
    const date = new CalendarDate(2026, 3, 29);
    expect(shiftCalendarDate(date, 'day', 1).toString()).toBe('2026-03-30');
    expect(shiftCalendarDate(date, 'week', -1).toString()).toBe('2026-03-22');
    expect(shiftCalendarDate(date, 'month', 1).toString()).toBe('2026-04-29');
  });
});
