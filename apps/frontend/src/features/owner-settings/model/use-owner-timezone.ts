import { useQuery } from '@tanstack/react-query';
import { ownerOperationsSettingsQueryOptions } from '../api/operations-queries';

/** Settings are the shared source of truth; the documented default is used only while unavailable. */
export function useOwnerTimezone(): string {
  const settings = useQuery(ownerOperationsSettingsQueryOptions());
  return settings.data?.timezone ?? 'Europe/Moscow';
}
