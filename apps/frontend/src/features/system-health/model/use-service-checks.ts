import { useQuery } from '@tanstack/react-query';
import { ru } from '../../../shared/lib/ru';
import type { StatusCheck } from '../../../shared/lib/status-check';
import { healthQueryOptions } from '../api/health';

/** «Сервис» (API reachable) and «Публикация» (the server's publishing switch) from GET /health. */
export function useServiceChecks(): { checks: StatusCheck[]; checkedAt: string | undefined } {
  const { data, isPending, isError, isFetching, refetch } = useQuery(healthQueryOptions());
  const service: StatusCheck = isPending
    ? { id: 'service', name: ru.health.service, tone: 'loading', summary: ru.health.loading }
    : isError
      ? {
          id: 'service',
          name: ru.health.service,
          tone: 'danger',
          summary: ru.systemStatus.checkFailed,
          headline: ru.systemStatus.serviceFailed,
          action: { label: ru.health.retry, onPress: () => void refetch(), isLoading: isFetching }
        }
      : { id: 'service', name: ru.health.service, tone: 'ok', summary: ru.status.ok };
  const checks = [service];
  if (data) {
    checks.push({
      id: 'publishing',
      name: ru.health.publishing,
      tone: 'ok',
      summary: data.publishingEnabled ? ru.health.publishingEnabled : ru.health.publishingDisabled
    });
  }
  return { checks, checkedAt: data?.time };
}
