import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { openIncidentsQueryOptions, useResolveIncident } from '../api/incidents-queries';

/**
 * Opening a failed publication acknowledges its incident: the owner has seen the error, so the sidebar badge drops it
 * (owner, 22.10.2026). Only `publish_failed`: an unknown send stays open until it is reconciled with the channel, since
 * closing it unseen could lose or double a post.
 */
export function useAcknowledgeFailedOnView(publicationId: string | null): void {
  const query = useQuery({ ...openIncidentsQueryOptions(), refetchInterval: false, enabled: publicationId !== null });
  const { mutate } = useResolveIncident();
  // One request per incident: a refetch before the server's answer must not send it again.
  const sent = useRef(new Set<string>());
  const incidentId =
    publicationId === null
      ? undefined
      : query.data?.items.find((item) => item.kind === 'publish_failed' && item.publication?.id === publicationId)?.id;
  useEffect(() => {
    if (incidentId === undefined || sent.current.has(incidentId)) return;
    sent.current.add(incidentId);
    mutate(incidentId);
  }, [incidentId, mutate]);
}
