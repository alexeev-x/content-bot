import { healthSchema } from '@alexeev/contracts';
import { queryOptions } from '@tanstack/react-query';
import { apiRequest } from '../../../shared/api/http-client';

const healthKeys = {
  all: ['health'] as const,
  detail: () => [...healthKeys.all, 'detail'] as const
};

export function healthQueryOptions() {
  return queryOptions({
    queryKey: healthKeys.detail(),
    queryFn: ({ signal }) => apiRequest('/api/v1/health', healthSchema, { signal }),
    staleTime: 30_000
  });
}
