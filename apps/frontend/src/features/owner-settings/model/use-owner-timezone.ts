import { useQuery } from '@tanstack/react-query';
import { ownerOperationsSettingsQueryOptions } from '../api/operations-queries';

const DEFAULT_TIMEZONE = 'Europe/Moscow';

/** Settings are the shared source of truth; the documented default is used only while unavailable. */
export function useOwnerTimezone(): string {
  return useOwnerTimezoneState().timezone;
}

/**
 * `known` turns true once the settings answered (or failed, then the default stands): a read keyed by the zone
 * waits for it, instead of running once for the default and again for the real zone.
 */
export function useOwnerTimezoneState(): { timezone: string; known: boolean } {
  const settings = useQuery(ownerOperationsSettingsQueryOptions());
  return { timezone: settings.data?.timezone ?? DEFAULT_TIMEZONE, known: !settings.isPending };
}
