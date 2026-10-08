import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { PublicationDto, PublicationStatus } from '@alexeev/contracts';
import { ApiError } from '../../shared/api/http-client';
import { ru } from '../../shared/lib/ru';
import { classifyApiError } from '../../shared/api/error-kind';
import {
  browserTimeZone,
  isInProgress,
  PublicationDrawer,
  PublicationTable,
  publicationCopy,
  publicationRowText,
  utcOffsetLabel
} from '../../features/publications';
import {
  Button,
  EmptyState,
  ErrorState,
  FooterLine,
  PageHeader,
  Panel,
  Tab,
  TabList,
  TableSearch,
  Tabs,
  VisuallyHidden,
  useMediaQuery,
  useRowSearch
} from '../../shared/ui';
import { PhoneFilters, SearchFilter, type Order } from './PublicationsFilters';
import { PublishPostDialog } from './PublishPostDialog';
import type { PublicationsSearch, PublicationView } from './search';
import { useDocumentTitle } from './use-document-title';
import styles from './PublicationsPage.module.css';
import { usePublicationsData } from './use-publications-data';

type Props = {
  search: PublicationsSearch;
  /** Merges into the URL search; filters are history entries, the open drawer id too. */
  onSearchChange: (patch: Partial<PublicationsSearch>, options?: { replace?: boolean }) => void;
  onOpenPosts: () => void;
  /** Test hook: poll interval in ms (production uses the feature default of 15 s). */
  pollMs?: number;
};

const copy = publicationCopy;
const NARROW = '(max-width: 859px)';
const CLEARED: Partial<PublicationsSearch> = { post: undefined, order: undefined };

export function PublicationsPage({ search, onSearchChange, onOpenPosts, pollMs }: Props) {
  useDocumentTitle(copy.list.title);
  const narrow = useMediaQuery(NARROW);
  const { list, items, post, postTitle, channel } = usePublicationsData(search, pollMs);
  const [publishOpen, setPublishOpen] = useState(false);
  // The search covers the loaded rows only and is not carried across tabs.
  const [query, setQuery] = useState('');
  const announcement = useStatusAnnouncement(items);
  // The offset is read once per visit: it only changes at a DST switch, and render must stay pure.
  const [zoneNote] = useState(() => {
    const zone = browserTimeZone();
    return `${zone}, ${utcOffsetLabel(new Date(), zone)}`;
  });
  const polling = items.some((item) => isInProgress(item.status));

  const openRow = search.id ? items.find((item) => item.id === search.id) : undefined;
  const openDestination = openRow ? channel(openRow) : undefined;
  const view = search.view ?? 'all';
  const defaultOrder: Order = search.view === 'upcoming' ? 'asc' : 'desc';
  const order = search.order ?? defaultOrder;
  const [zone] = useState(() => browserTimeZone());
  const textOf = useCallback(
    (row: PublicationDto) => publicationRowText(row, post(row), channel(row)?.title, zone),
    [post, channel, zone]
  );
  const rows = useRowSearch(items, textOf, query);
  const isSearching = query.trim() !== '';

  const clearSearch = () => setQuery('');
  const resetAll = () => {
    setQuery('');
    onSearchChange({ ...CLEARED, view: undefined });
  };
  const ready = !list.isPending && !list.isError;
  const emptyFiltered = search.post !== undefined || search.view !== undefined || search.order !== undefined;

  const footer = list.isPending ? (
    <FooterLine text={copy.states.loading} />
  ) : ready && items.length > 0 ? (
    <FooterLine
      text={[
        copy.list.loaded(items.length, Boolean(list.hasNextPage)),
        isSearching && list.hasNextPage ? copy.filters.searchScope : null,
        polling ? copy.list.updating : null
      ]
        .filter(Boolean)
        .join(' · ')}
      action={
        list.hasNextPage ? (
          <Button
            variant="ghost"
            size="sm"
            isLoading={list.isFetchingNextPage}
            onPress={() => void list.fetchNextPage()}
          >
            {copy.list.loadMore}
          </Button>
        ) : undefined
      }
    />
  ) : undefined;

  return (
    <>
      <PageHeader
        title={copy.list.title}
        actions={
          <Button icon="send" onPress={() => setPublishOpen(true)}>
            {copy.list.publishPost}
          </Button>
        }
      />
      <div className={styles.page}>
        <Tabs
          selectedKey={view}
          onSelectionChange={(key) => {
            setQuery('');
            onSearchChange({
              view: key === 'all' ? undefined : (key as PublicationView),
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
        </Tabs>
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
          <Wrap narrow={narrow}>
            <Panel
              title={narrow ? copy.list.title : copy.list.panel[view]}
              note={zoneNote}
              {...(narrow ? {} : { action: <SearchFilter query={query} onChange={setQuery} /> })}
              {...(ready && rows.length > 0 ? {} : { reserveRows: narrow ? 6 : 8 })}
              {...(footer ? { footer } : {})}
            >
              {narrow ? (
                <PhoneFilters
                  query={query}
                  onQueryChange={setQuery}
                  order={search.order}
                  defaultOrder={defaultOrder}
                  isLoading={list.isPending}
                  onOrderChange={(next) => onSearchChange({ order: next })}
                />
              ) : null}
              {ready && rows.length === 0 ? (
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
                  narrow={narrow}
                  rows={rows}
                  rowText={textOf}
                  isLoading={list.isPending}
                  post={post}
                  channel={channel}
                  activeId={search.id}
                  onOpen={(id) => onSearchChange({ id })}
                  order={order}
                  onOrderChange={(next) => onSearchChange({ order: next })}
                />
              )}
            </Panel>
          </Wrap>
        )}
      </div>

      <PublicationDrawer
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
      />
      <PublishPostDialog isOpen={publishOpen} onOpenChange={setPublishOpen} onOpenPosts={onOpenPosts} />
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
