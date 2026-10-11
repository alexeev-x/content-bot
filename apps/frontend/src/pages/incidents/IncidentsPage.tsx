import { useDocumentTitle } from '../../app/use-document-title';
import { Incidents, incidentsCopy } from '../../features/incidents';
import { useOwnerTimezone } from '../../features/owner-settings';
import { utcOffsetLabel } from '../../shared/lib/owner-timezone';
import { useNow } from '../../shared/lib/use-now';
import { ru } from '../../shared/lib/ru';
import { PageHeader } from '../../shared/ui';
import type { IncidentsSearch } from './search';

type Props = {
  search: IncidentsSearch;
  /** Merges into the URL search; filters are history entries. */
  onSearchChange: (patch: Partial<IncidentsSearch>) => void;
  onOpenPublication: (publicationId: string) => void;
  onOpenPublications: () => void;
  /** Test hook: poll interval in ms (production uses the 30 s default). */
  pollMs?: number;
};

export function IncidentsPage({ search, onSearchChange, onOpenPublication, onOpenPublications, pollMs }: Props) {
  useDocumentTitle(ru.pages.incidents);
  const zone = useOwnerTimezone();
  const now = useNow();
  const zoneNote = incidentsCopy.states.zone(zone, utcOffsetLabel(now, zone));
  return (
    <>
      <PageHeader title={ru.pages.incidents} description={zoneNote} />
      <Incidents
        state={search.state}
        kind={search.kind}
        timezone={zone}
        onStateChange={(state) => onSearchChange({ state })}
        onKindChange={(kind) => onSearchChange({ kind })}
        onOpenPublication={onOpenPublication}
        onOpenPublications={onOpenPublications}
        {...(pollMs === undefined ? {} : { pollMs })}
      />
    </>
  );
}
