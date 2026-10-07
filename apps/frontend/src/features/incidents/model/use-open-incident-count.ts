import { useQuery } from '@tanstack/react-query';
import { openIncidentCountQueryOptions } from '../api/incidents-queries';

/** Open incidents for the sidebar badge; 0 until the first answer and after a failure (a badge never guesses). */
export function useOpenIncidentCount(pollMs?: number): number {
  return useQuery(openIncidentCountQueryOptions(pollMs)).data ?? 0;
}
