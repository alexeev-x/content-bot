import type { IncidentDto, IncidentKind, IncidentState } from '@alexeev/contracts';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { classifyApiError } from '../../../shared/api/error-kind';
import { ApiError } from '../../../shared/api/http-client';
import {
  AppliedChips,
  Banner,
  Button,
  EmptyState,
  ErrorState,
  FooterLine,
  Panel,
  PanelList,
  Tab,
  TabList,
  Tabs,
  useMediaQuery
} from '../../../shared/ui';
import { incidentsInfiniteQueryOptions } from '../api/incidents-queries';
import { copy } from './copy';
import { IncidentFilters } from './IncidentFilters';
import { IncidentRow } from './IncidentRow';
import { IncidentsListSkeleton } from './IncidentsSkeleton';
import styles from './Incidents.module.css';

const NARROW = '(max-width: 859px)';

type Props = {
  state: IncidentState;
  kind: IncidentKind | undefined;
  onStateChange: (state: IncidentState) => void;
  onKindChange: (kind: IncidentKind | undefined) => void;
  onOpenPublication: (publicationId: string) => void;
  /** Where «К публикациям» of the empty state goes (the route is the page's business). */
  onOpenPublications: () => void;
  timezone?: string;
  /** Test hook: poll interval in ms (production uses the 30 s default). */
  pollMs?: number;
};

const kindLabel = (kind: IncidentKind) => (kind === 'publish_unknown' ? copy.filters.unknown : copy.filters.failed);

export function Incidents({
  state,
  kind,
  onStateChange,
  onKindChange,
  onOpenPublication,
  onOpenPublications,
  timezone,
  pollMs
}: Props) {
  const narrow = useMediaQuery(NARROW);
  const query = useInfiniteQuery(incidentsInfiniteQueryOptions({ state, kind }, pollMs));
  // Polling refetches every loaded page; a row that moved between pages must still appear once.
  const items = useMemo<IncidentDto[]>(() => {
    const seen = new Set<string>();
    const rows: IncidentDto[] = [];
    for (const page of query.data?.pages ?? []) {
      for (const item of page.items) {
        if (!seen.has(item.id)) {
          seen.add(item.id);
          rows.push(item);
        }
      }
    }
    return rows;
  }, [query.data]);

  const tabs = (
    <Tabs selectedKey={state} onSelectionChange={(key) => onStateChange(key === 'resolved' ? 'resolved' : 'open')}>
      <TabList aria-label={copy.filters.state}>
        <Tab id="open">{copy.filters.open}</Tab>
        <Tab id="resolved">{copy.filters.resolved}</Tab>
      </TabList>
    </Tabs>
  );
  const filters = (
    <IncidentFilters kind={kind} narrow={narrow} isDisabled={query.isPending} onKindChange={onKindChange} />
  );
  const title = state === 'open' ? copy.panel.open : copy.panel.resolved;

  if (!query.isPending && !query.data) {
    if (classifyApiError(query.error) === 'forbidden') {
      return <ErrorState title={copy.states.forbiddenTitle} message={copy.states.forbiddenMessage} />;
    }
    const requestId = query.error instanceof ApiError ? query.error.requestId : undefined;
    return (
      <div className={styles.page}>
        {tabs}
        <ErrorState
          title={copy.states.errorTitle}
          message={copy.states.errorMessage}
          {...(requestId ? { requestId } : {})}
          onRetry={() => void query.refetch()}
        />
      </div>
    );
  }

  const ready = query.data !== undefined;
  const footer = !ready ? (
    <FooterLine text={copy.loading} />
  ) : items.length > 0 ? (
    <FooterLine
      text={copy.states.loaded(items.length, Boolean(query.hasNextPage))}
      action={
        query.hasNextPage ? (
          <Button
            variant="ghost"
            size="sm"
            isLoading={query.isFetchingNextPage}
            onPress={() => void query.fetchNextPage()}
          >
            {copy.states.more}
          </Button>
        ) : undefined
      }
    />
  ) : undefined;

  return (
    <div className={styles.page}>
      {tabs}
      {query.isRefetchError ? (
        <Banner
          tone="warning"
          title={copy.states.staleTitle}
          action={
            <Button size="sm" variant="secondary" isLoading={query.isFetching} onPress={() => void query.refetch()}>
              {copy.states.refresh}
            </Button>
          }
        />
      ) : null}
      <Panel
        title={title}
        {...(!narrow && kind
          ? {
              action: (
                <Button variant="ghost" size="sm" icon="x" onPress={() => onKindChange(undefined)}>
                  {copy.filters.reset}
                </Button>
              )
            }
          : {})}
        {...(ready && items.length > 0 ? {} : { reserveRows: narrow ? 5 : 6 })}
        {...(footer ? { footer } : {})}
      >
        {filters}
        {narrow && kind ? (
          <AppliedChips
            chips={[{ id: 'kind', label: `${copy.filters.kind}: ${kindLabel(kind)}` }]}
            onRemove={() => onKindChange(undefined)}
          />
        ) : null}
        {!ready ? (
          <div aria-busy="true">
            <IncidentsListSkeleton />
          </div>
        ) : items.length === 0 ? (
          kind ? (
            <EmptyState
              icon="search"
              title={copy.states.emptyFiltered}
              action={
                <Button variant="secondary" onPress={() => onKindChange(undefined)}>
                  {copy.filters.reset}
                </Button>
              }
            />
          ) : state === 'open' ? (
            <EmptyState
              icon="check-circle"
              title={copy.states.emptyOpenTitle}
              description={copy.states.emptyOpenDescription}
              action={
                <Button variant="secondary" onPress={onOpenPublications}>
                  {copy.states.emptyOpenAction}
                </Button>
              }
            />
          ) : (
            <EmptyState icon="clock" title={copy.states.emptyResolved} />
          )
        ) : (
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
        )}
      </Panel>
    </div>
  );
}
