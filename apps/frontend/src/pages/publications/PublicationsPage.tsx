import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { PublicationDeleteRefusal, PublicationDto, PublicationStatus } from '@alexeev/contracts';
import { PAGE_SIZE } from '../../shared/api/page-query';
import { ApiError } from '../../shared/api/http-client';
import { ru } from '../../shared/lib/ru';
import { classifyApiError } from '../../shared/api/error-kind';
import {
  DeletePublicationsDialog,
  deleteTargetOf,
  PublicationDrawer,
  PublicationTable,
  publicationCopy,
  publicationRowText
} from '../../features/publications';
import {
  ActiveFilters,
  Button,
  EmptyState,
  ErrorState,
  Menu,
  Pagination,
  PageHeader,
  Panel,
  SelectionBar,
  StaleRegion,
  Tab,
  TabList,
  TabPanel,
  TableSearch,
  Tabs,
  VisuallyHidden,
  useMediaQuery,
  Select
} from '../../shared/ui';
import type { RowSelection } from '../../shared/ui';
import { periodOptions, PhoneFilters, SearchFilter, type Order } from './PublicationsFilters';
import { PublishPostDialog } from './PublishPostDialog';
import { PublishSeriesDialog } from './PublishSeriesDialog';
import { ResendPublicationDialog } from './ResendPublicationDialog';
import type { PublicationPeriod, PublicationsSearch, PublicationView } from './search';
import { useDocumentTitle } from '../../app/use-document-title';
import styles from './PublicationsPage.module.css';
import { usePublicationsData } from './use-publications-data';
import { OpenIncidents, useAcknowledgeFailedOnView } from '../../features/incidents';
import { useOwnerTimezone } from '../../features/owner-settings';

type Props = {
  search: PublicationsSearch;
  /** Merges into the URL search; filters are history entries, the open drawer id too. */
  onSearchChange: (patch: Partial<PublicationsSearch>, options?: { replace?: boolean }) => void;
  onOpenPosts: () => void;
  /** The post's publish screen, the one entry point for a new publication. */
  onPublishPost: (postId: string) => void;
  /** Test hook: poll interval in ms (production uses the feature default of 15 s). */
  pollMs?: number;
};

const copy = publicationCopy;
const NARROW = '(max-width: 859px)';

/** «14 октября» in the owner's zone for the day chip; «выбранный» when the range has no start. */
function dayChipLabel(from: string | undefined, timeZone: string): string {
  if (from === undefined) return 'выбранный';
  return new Intl.DateTimeFormat('ru-RU', { timeZone, day: 'numeric', month: 'long' }).format(new Date(from));
}
const CLEARED: Partial<PublicationsSearch> = { post: undefined, order: undefined };

export function PublicationsPage({ search, onSearchChange, onOpenPosts, onPublishPost, pollMs }: Props) {
  useDocumentTitle(copy.list.title);
  const narrow = useMediaQuery(NARROW);
  const timezone = useOwnerTimezone();
  const { list, detailsPending, switching, shownView, items, post, postTitle, channel } = usePublicationsData(
    search,
    timezone,
    pollMs
  );
  const [publishOpen, setPublishOpen] = useState(false);
  const [seriesOpen, setSeriesOpen] = useState(false);
  const [deleteTargets, setDeleteTargets] = useState<ReturnType<typeof deleteTargetOf>[] | null>(null);
  const [resendFor, setResendFor] = useState<PublicationDto | null>(null);
  const [query, setQuery] = useState(search.q ?? '');
  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(search.q ?? ''), 0);
    return () => window.clearTimeout(timer);
  }, [search.q]);
  useEffect(() => {
    const normalized = query.trim();
    if (normalized === (search.q ?? '')) return;
    const timer = window.setTimeout(() => onSearchChange({ q: normalized || undefined }, { replace: true }), 250);
    return () => window.clearTimeout(timer);
  }, [onSearchChange, query, search.q]);
  const announcement = useStatusAnnouncement(items);
  // The offset is read once per visit: it only changes at a DST switch, and render must stay pure.

  useAcknowledgeFailedOnView(search.id ?? null);
  const openRow = search.id ? items.find((item) => item.id === search.id) : undefined;
  const openDestination = openRow ? channel(openRow) : undefined;
  const view = search.view ?? 'all';
  const selectionScope = `${view}\u0000${search.post ?? ''}\u0000${search.q ?? ''}\u0000${search.period ?? ''}\u0000${search.from ?? ''}\u0000${search.to ?? ''}`;
  const [storedSelection, setStoredSelection] = useState<{
    scope: string;
    mode: boolean;
    selected: ReadonlyMap<string, number>;
  }>({ scope: selectionScope, mode: false, selected: new Map() });
  const selection =
    storedSelection.scope === selectionScope
      ? storedSelection
      : { scope: selectionScope, mode: false, selected: new Map<string, number>() };
  const { mode: selectMode, selected } = selection;
  const defaultOrder: Order = shownView === 'upcoming' ? 'asc' : 'desc';
  const order = search.order ?? defaultOrder;
  const zone = timezone;
  const textOf = useCallback(
    (row: PublicationDto) => publicationRowText(row, post(row), channel(row)?.title, zone),
    [post, channel, zone]
  );
  const rows = items;
  const isSearching = (search.q ?? '').trim() !== '';

  const clearSearch = () => {
    setQuery('');
    onSearchChange({ q: undefined }, { replace: true });
  };
  const onPeriodChange = (value: string | undefined) =>
    onSearchChange({
      period: value === undefined || value === 'all' ? undefined : (value as PublicationPeriod),
      from: undefined,
      to: undefined,
      id: undefined
    });
  const resetAll = () => {
    setQuery('');
    onSearchChange({ ...CLEARED, view: undefined, period: undefined, q: undefined, from: undefined, to: undefined });
  };
  const ready = !list.isPending && !list.isError;
  const emptyFiltered =
    search.post !== undefined ||
    search.view !== undefined ||
    search.order !== undefined ||
    search.period !== undefined ||
    search.from !== undefined ||
    search.to !== undefined;
  const selectableRows = rows.filter(
    (row) => row.status === 'sent' || row.status === 'failed' || row.status === 'cancelled'
  );
  const selectableIds = new Set(selectableRows.map((row) => row.id));
  function clearSelection() {
    setStoredSelection({ scope: selectionScope, mode: false, selected: new Map() });
  }

  function onSelectionChange(selection: RowSelection) {
    const ids = selection === 'all' ? selectableRows.map((row) => row.id) : [...selection];
    setStoredSelection({
      scope: selectionScope,
      mode: true,
      selected: new Map(
        ids
          .filter((id) => selectableIds.has(id))
          .slice(0, 100)
          .flatMap((id) => {
            const row = rows.find((item) => item.id === id);
            return row ? [[id, row.revision] as const] : [];
          })
      )
    });
  }

  function togglePublication(publication: PublicationDto, on: boolean) {
    if (publication.status !== 'sent' && publication.status !== 'failed' && publication.status !== 'cancelled') return;
    setStoredSelection((current) => {
      const next = new Map(current.scope === selectionScope ? current.selected : []);
      if (on && next.size < 100) next.set(publication.id, publication.revision);
      else next.delete(publication.id);
      return { scope: selectionScope, mode: true, selected: next };
    });
  }

  function onDeleteDone(outcome: { deleted: string[]; refused: ReadonlyMap<string, PublicationDeleteRefusal> }) {
    setStoredSelection({
      scope: selectionScope,
      mode: outcome.refused.size > 0,
      selected: new Map([...outcome.refused].map(([id]) => [id, selected.get(id) ?? 0]))
    });
    if (search.id && outcome.deleted.includes(search.id)) onSearchChange({ id: undefined }, { replace: true });
  }

  const totalCount = list.data?.totalCount ?? 0;
  const page = search.page ?? 1;
  const lastPage = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  // A page emptied by deletions falls back to the new last page.
  useEffect(() => {
    if (!list.isPlaceholderData && !list.isPending && !list.isError && page > lastPage) {
      onSearchChange({ page: lastPage > 1 ? lastPage : undefined }, { replace: true });
    }
  }, [lastPage, list.isError, list.isPending, list.isPlaceholderData, onSearchChange, page]);
  const isSearchSettling = query.trim() !== (search.q ?? '') || (list.isPlaceholderData && list.isFetching);
  const footer = list.isPending ? (
    <Pagination page={1} pageSize={PAGE_SIZE} totalCount={0} onPageChange={() => {}} isLoading />
  ) : ready && (items.length > 0 || totalCount > 0) ? (
    <Pagination
      page={page}
      pageSize={PAGE_SIZE}
      totalCount={totalCount}
      onPageChange={(next) => {
        clearSelection();
        onSearchChange({ page: next > 1 ? next : undefined }, { replace: true });
      }}
      isSearching={isSearchSettling}
    />
  ) : undefined;

  return (
    <>
      <PageHeader
        title={copy.list.title}
        // Two side-by-side buttons were 387 px wide and pushed the phone layout to 427 px: one primary action
        // plus the rare «серия» in a menu.
        primaryAction={
          <Button icon="send" onPress={() => setPublishOpen(true)}>
            {copy.list.publishPost}
          </Button>
        }
        secondaryActions={
          <Menu
            label="Ещё действия"
            items={[{ id: 'series', label: 'Опубликовать серию', icon: 'list' }]}
            onAction={(id) => {
              if (id === 'series') setSeriesOpen(true);
            }}
          />
        }
      />
      <div className={styles.page}>
        {narrow ? null : (
          <div className={styles.period}>
            <Select
              label="Период публикаций"
              options={periodOptions}
              value={search.period ?? 'all'}
              onChange={(value) => onPeriodChange(value)}
            />
          </div>
        )}
        <ActiveFilters
          label="Включённые фильтры"
          resetLabel="Сбросить всё"
          onResetAll={resetAll}
          filters={[
            ...(search.period !== undefined
              ? [
                  {
                    id: 'period',
                    label: `Период: ${periodOptions.find((option) => option.id === search.period)?.label ?? search.period}`,
                    onRemove: () => onSearchChange({ period: undefined })
                  }
                ]
              : []),
            ...(search.from !== undefined || search.to !== undefined
              ? [
                  {
                    id: 'day',
                    label: `День: ${dayChipLabel(search.from, zone)}`,
                    onRemove: () => onSearchChange({ from: undefined, to: undefined })
                  }
                ]
              : []),
            ...(search.post !== undefined
              ? [{ id: 'post', label: 'Только один пост', onRemove: () => onSearchChange({ post: undefined }) }]
              : []),
            ...(isSearching ? [{ id: 'q', label: `Поиск: «${(search.q ?? '').trim()}»`, onRemove: clearSearch }] : [])
          ]}
        />
        <Tabs
          selectedKey={view}
          onSelectionChange={(key) => {
            setQuery('');
            onSearchChange({
              view: key === 'all' ? undefined : (key as PublicationView),
              q: undefined,
              order: undefined
            });
          }}
        >
          <TabList aria-label={copy.tabs.label}>
            <Tab id="all">{copy.tabs.all}</Tab>
            <Tab id="upcoming">{narrow ? copy.tabs.upcomingShort : copy.tabs.upcoming}</Tab>
            <Tab id="recent">{narrow ? copy.tabs.recentShort : copy.tabs.recent}</Tab>
            <Tab id="errors">{copy.tabs.errors}</Tab>
          </TabList>
          <TabPanel id={view}>
            {search.post ? (
              <p className={styles.note}>
                {copy.list.onePost}{' '}
                <Button variant="ghost" size="sm" onPress={() => onSearchChange({ post: undefined })}>
                  {copy.list.allPosts}
                </Button>
              </p>
            ) : null}
            <VisuallyHidden>
              <output aria-live="polite">{announcement}</output>
            </VisuallyHidden>

            {list.isError ? (
              <ListError error={list.error} onRetry={() => void list.refetch()} />
            ) : (
              <StaleRegion busy={switching}>
                <Wrap narrow={narrow}>
                  <Panel
                    title={narrow ? copy.list.title : copy.list.panel[shownView]}
                    action={
                      <>
                        {selectMode ? (
                          <Button variant="ghost" size="sm" onPress={clearSelection}>
                            {copy.deletion.done}
                          </Button>
                        ) : selectableRows.length > 0 ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            icon="check-circle"
                            onPress={() =>
                              setStoredSelection({ scope: selectionScope, mode: true, selected: new Map() })
                            }
                          >
                            {copy.deletion.select}
                          </Button>
                        ) : null}
                        {narrow ? null : <SearchFilter query={query} onChange={setQuery} />}
                      </>
                    }
                    {...(ready && rows.length > 0 ? {} : { reserveRows: narrow ? 6 : 8 })}
                    {...(footer ? { footer } : {})}
                  >
                    {narrow ? (
                      <PhoneFilters
                        query={query}
                        onQueryChange={setQuery}
                        order={search.order}
                        defaultOrder={defaultOrder}
                        period={search.period}
                        onPeriodChange={onPeriodChange}
                        isLoading={list.isPending || detailsPending}
                        onOrderChange={(next) => onSearchChange({ order: next })}
                      />
                    ) : null}
                    {ready && rows.length === 0 && totalCount === 0 ? (
                      isSearching ? (
                        <EmptyState
                          icon="search"
                          title={copy.filters.searchEmptyTitle}
                          description={copy.filters.searchEmptyDescription}
                          action={
                            <Button variant="secondary" onPress={clearSearch}>
                              {ru.ui.clearSearch}
                            </Button>
                          }
                        />
                      ) : emptyFiltered ? (
                        <EmptyState
                          icon="search"
                          title={copy.states.filteredTitle}
                          description={copy.states.filteredDescription}
                          action={
                            <Button variant="secondary" onPress={resetAll}>
                              {copy.filters.reset}
                            </Button>
                          }
                        />
                      ) : (
                        <EmptyState
                          icon="send"
                          title={copy.states.emptyTitle}
                          description={copy.states.emptyDescription}
                          action={<Button onPress={onOpenPosts}>{copy.states.emptyAction}</Button>}
                        />
                      )
                    ) : (
                      <PublicationTable
                        timezone={timezone}
                        narrow={narrow}
                        rows={rows}
                        rowText={textOf}
                        isLoading={list.isPending || detailsPending}
                        post={post}
                        channel={channel}
                        activeId={search.id}
                        onOpen={(id) => onSearchChange({ id })}
                        order={order}
                        onOrderChange={(next) => onSearchChange({ order: next })}
                        selectable={selectMode}
                        selected={new Set(selected.keys())}
                        onSelectionChange={onSelectionChange}
                        onToggle={togglePublication}
                      />
                    )}
                    {selectMode ? (
                      <SelectionBar
                        label={copy.deletion.selectionLabel}
                        summary={copy.deletion.selected(selected.size)}
                        {...(selected.size >= 100 ? { hint: copy.deletion.limit } : {})}
                      >
                        <Button
                          variant="danger"
                          icon="trash"
                          isDisabled={selected.size === 0}
                          onPress={() => {
                            const targets = items
                              .filter((item) => selected.has(item.id))
                              .map((item) => deleteTargetOf(item, postTitle(item) ?? copy.list.unknownPost));
                            if (targets.length > 0) setDeleteTargets(targets);
                          }}
                        >
                          {copy.deletion.delete}
                        </Button>
                        <Button variant="ghost" onPress={clearSelection}>
                          {copy.deletion.clear}
                        </Button>
                      </SelectionBar>
                    ) : null}
                  </Panel>
                </Wrap>
              </StaleRegion>
            )}
            {/* Below the table: a per-tab block above it would move the table when the tab changes. */}
            {view === 'errors' ? (
              <OpenIncidents
                timezone={timezone}
                onOpenPublication={(id) => onSearchChange({ id })}
                {...(pollMs === undefined ? {} : { pollMs })}
              />
            ) : null}
          </TabPanel>
        </Tabs>
      </div>

      <PublicationDrawer
        timezone={timezone}
        publicationId={search.id ?? null}
        isOpen={search.id !== undefined}
        onOpenChange={(open) => {
          if (!open) onSearchChange({ id: undefined }, { replace: true });
        }}
        placeholder={openRow}
        postTitle={openRow ? postTitle(openRow) : undefined}
        postBody={openRow ? post(openRow)?.body : undefined}
        destinationTitle={openDestination?.title}
        chatId={openDestination?.chatId}
        pollMs={pollMs}
        onResend={setResendFor}
        onDelete={(publication) =>
          setDeleteTargets([deleteTargetOf(publication, postTitle(publication) ?? copy.list.unknownPost)])
        }
      />
      <ResendPublicationDialog publication={resendFor} timezone={timezone} onClose={() => setResendFor(null)} />
      <PublishPostDialog
        timezone={timezone}
        isOpen={publishOpen}
        onOpenChange={setPublishOpen}
        onOpenPosts={onOpenPosts}
        onPublish={onPublishPost}
      />
      {seriesOpen || search.series !== undefined ? (
        <PublishSeriesDialog
          timezone={timezone}
          isOpen
          {...(search.series === undefined ? {} : { initialPostIds: search.series })}
          onOpenChange={(open) => {
            setSeriesOpen(open);
            // Opened from an event's series: closing it leaves the address as a plain list.
            if (!open && search.series !== undefined) onSearchChange({ series: undefined }, { replace: true });
          }}
          onPublished={(id) => onSearchChange({ id, series: undefined })}
        />
      ) : null}
      {deleteTargets ? (
        <DeletePublicationsDialog
          targets={deleteTargets}
          onOpenChange={(open) => {
            if (!open) setDeleteTargets(null);
          }}
          onDone={onDeleteDone}
        />
      ) : null}
    </>
  );
}

function ListError({ error, onRetry }: { error: Error; onRetry: () => void }) {
  if (classifyApiError(error) === 'forbidden') {
    return <ErrorState title={copy.states.forbiddenTitle} message={copy.states.forbiddenMessage} />;
  }
  const requestId = error instanceof ApiError ? error.requestId : undefined;
  return (
    <ErrorState
      title={copy.states.errorTitle}
      message={copy.states.errorMessage}
      {...(requestId ? { requestId } : {})}
      onRetry={onRetry}
    />
  );
}

/** One batched polite message when background polling changes a status the owner is looking at. */
function useStatusAnnouncement(items: readonly { id: string; status: PublicationStatus }[]): string {
  const previous = useRef<Map<string, PublicationStatus> | null>(null);
  const [message, setMessage] = useState('');
  useEffect(() => {
    const next = new Map(items.map((item) => [item.id, item.status]));
    const before = previous.current;
    previous.current = next;
    if (before === null) return;
    const changed = items.some((item) => before.has(item.id) && before.get(item.id) !== item.status);
    if (changed) setMessage(copy.states.livePolite);
  }, [items]);
  return message;
}

/** Desktop only: the field in the panel header and the table below it share the Arrow Down shortcut. */
function Wrap({ narrow, children }: { narrow: boolean; children: ReactNode }) {
  return narrow ? <>{children}</> : <TableSearch>{children}</TableSearch>;
}
