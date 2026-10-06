import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { appearanceQueryOptions } from '../api/appearance-queries';
import { toValue, type AppearanceValue } from './appearance-value';

/**
 * After sign-in: fetch the server appearance and apply it (persisting the cache). A failed fetch leaves the
 * cached appearance in place; the settings page reports the failure itself.
 */
export function useAppearanceSync(apply: (value: AppearanceValue) => void): void {
  const { data } = useQuery(appearanceQueryOptions());
  useEffect(() => {
    if (data) apply(toValue(data));
  }, [data, apply]);
}
