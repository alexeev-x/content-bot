import { queryOptions } from '@tanstack/react-query';
import { getRubricForecast, getRubricSchedulerStatus } from './rubrics-api';

const rubricKeys = {
  all: ['rubrics'] as const,
  status: () => [...rubricKeys.all, 'status'] as const,
  forecast: () => [...rubricKeys.all, 'forecast'] as const
};

export function rubricStatusQueryOptions() {
  return queryOptions({
    queryKey: rubricKeys.status(),
    queryFn: ({ signal }) => getRubricSchedulerStatus(signal),
    staleTime: 60_000
  });
}

/** The server keeps a forecast for 5 minutes: asking more often shows nothing new. */
export function rubricForecastQueryOptions() {
  return queryOptions({
    queryKey: rubricKeys.forecast(),
    queryFn: ({ signal }) => getRubricForecast(signal),
    staleTime: 5 * 60_000
  });
}
