import { queryOptions } from '@tanstack/react-query';
import { fetchCalendarData } from './calendar-api';

export const calendarKeys = {
  all: ['calendar'] as const,
  range: (from: string, to: string) => [...calendarKeys.all, { from, to }] as const
};

export function calendarRangeQueryOptions(from: string, to: string) {
  return queryOptions({
    queryKey: calendarKeys.range(from, to),
    queryFn: ({ signal }) => fetchCalendarData({ from, to }, signal),
    staleTime: 15_000,
    retry: (failureCount, error) => {
      if (error instanceof Error && error.name === 'CalendarRangeTooDenseError') return false;
      return failureCount < 1;
    }
  });
}
