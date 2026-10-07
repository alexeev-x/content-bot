import { useQuery } from '@tanstack/react-query';
import { openIncidentCountQueryOptions } from '../api/incidents-queries';

/** Open incidents for the sidebar badge; 0 until the first answer and after a failure (a badge never guesses). */
export function useOpenIncidentCount(staleMs?: number): number {
  return useQuery(openIncidentCountQueryOptions(staleMs)).data ?? 0;
}
