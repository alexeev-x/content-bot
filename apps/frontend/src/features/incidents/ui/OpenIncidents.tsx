import type { IncidentDto } from '@alexeev/contracts';
import { useQuery } from '@tanstack/react-query';
import { Panel, PanelList } from '../../../shared/ui';
import { openIncidentsQueryOptions } from '../api/incidents-queries';
import { copy } from './copy';
import { IncidentRow } from './IncidentRow';

type Props = {
  timezone?: string;
  onOpenPublication: (publicationId: string) => void;
  /** Test hook: poll interval in ms. */
  pollMs?: number;
};

/** Compact list of open incidents above the «Ошибки» table: acknowledge a failed one, or open an unknown one to reconcile it. */
export function OpenIncidents({ timezone, onOpenPublication, pollMs }: Props) {
  const query = useQuery(openIncidentsQueryOptions(pollMs));
  const items: readonly IncidentDto[] = query.data?.items ?? [];
  // Quiet when there is nothing to act on or the list is unavailable: the publications table below stays the source of truth.
  if (items.length === 0) return null;
  return (
    <Panel title={copy.panel.open}>
      <PanelList aria-label={copy.states.listLabel}>
        {items.map((incident) => (
          <IncidentRow
            key={incident.id}
            incident={incident}
            timezone={timezone}
            onOpenPublication={onOpenPublication}
          />
        ))}
      </PanelList>
    </Panel>
  );
}
