import { useState } from 'react';
import { useDocumentTitle } from '../../app/use-document-title';
import { Incidents, incidentsCopy } from '../../features/incidents';
import { browserTimeZone, utcOffsetLabel } from '../../features/publications';
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
  // The offset is read once per visit: it only changes at a DST switch, and render must stay pure.
  const [zoneNote] = useState(() => {
    const zone = browserTimeZone();
    return incidentsCopy.states.zone(zone, utcOffsetLabel(new Date(), zone));
  });
  return (
    <>
      <PageHeader title={ru.pages.incidents} description={zoneNote} />
      <Incidents
        state={search.state}
        kind={search.kind}
        onStateChange={(state) => onSearchChange({ state })}
        onKindChange={(kind) => onSearchChange({ kind })}
        onOpenPublication={onOpenPublication}
        onOpenPublications={onOpenPublications}
        {...(pollMs === undefined ? {} : { pollMs })}
      />
    </>
  );
}
