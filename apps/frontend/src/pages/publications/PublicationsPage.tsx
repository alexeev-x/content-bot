import type { PublicationStatus } from '@alexeev/contracts';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ApiError } from '../../shared/api/http-client';
import { classifyApiError } from '../../shared/api/error-kind';
import {
  browserTimeZone,
  isInProgress,
  PublicationDrawer,
  PublicationTable,
  publicationCopy,
  utcOffsetLabel
} from '../../features/publications';
import {
  AppliedChips,
  Button,
  EmptyState,
  ErrorState,
  FooterLine,
  PageHeader,
  Panel,
  Tab,
  TabList,
  Tabs,
  VisuallyHidden,
  useMediaQuery,
  type FilterChip
} from '../../shared/ui';
import {
  channelOptionsOf,
  orderOptions,
  PhoneFilters,
  PickFilter,
  SearchFilter,
  statusOptions,
  type Order
} from './PublicationsFilters';
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
const CLEARED: Partial<PublicationsSearch> = {
  status: undefined,
  channel: undefined,
  q: undefined,
  post: undefined,
  order: undefined
};

export function PublicationsPage({ search, onSearchChange, onOpenPosts, pollMs }: Props) {
  useDocumentTitle(copy.list.title);
  const narrow = useMediaQuery(NARROW);
  const { list, items, destinationList, post, postTitle, channel } = usePublicationsData(search, pollMs);
  const [publishOpen, setPublishOpen] = useState(false);
  const hasFilters =
    search.status !== undefined ||
    search.channel !== undefined ||
    search.q !== undefined ||
    search.post !== undefined ||
    search.order !== undefined;
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
  const channelOptions = useMemo(() => channelOptionsOf(destinationList), [destinationList]);

  const resetFilters = () => onSearchChange({ ...CLEARED });
  const resetAll = () => onSearchChange({ ...CLEARED, view: undefined });
  const ready = !list.isPending && !list.isError;
  const emptyFiltered = hasFilters || search.view !== undefined;

  const chips: FilterChip[] = [
    ...(search.status
      ? [{ id: 'status', label: `${copy.filters.status}: ${statusOptions.find((o) => o.id === search.status)?.label}` }]
      : []),
    ...(search.channel
      ? [
          {
            id: 'channel',
            label: `${copy.filters.channel}: ${channelOptions.find((o) => o.id === search.channel)?.label ?? ''}`
          }
        ]
      : []),
    ...(search.order ? [{ id: 'order', label: orderOptions.find((o) => o.id === search.order)?.label ?? '' }] : [])
  ];
  const removeChip = (id: string) =>
    onSearchChange(
      id === 'status' ? { status: undefined } : id === 'channel' ? { channel: undefined } : { order: undefined }
    );

  const footer = list.isPending ? (
    <FooterLine text={copy.states.loading} />
  ) : ready && items.length > 0 ? (
    <FooterLine
      text={`${copy.list.loaded(items.length, Boolean(list.hasNextPage))}${polling ? ` · ${copy.list.updating}` : ''}`}
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
          onSelectionChange={(key) =>
            onSearchChange({
              view: key === 'all' ? undefined : (key as PublicationView),
              status: undefined,
              order: undefined
            })
          }
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
          <Panel
            title={narrow ? copy.list.title : copy.list.panel[view]}
            note={zoneNote}
            {...(!narrow && hasFilters
              ? {
                  action: (
                    <Button variant="ghost" size="sm" icon="x" onPress={resetFilters}>
                      {copy.filters.reset}
                    </Button>
                  )
                }
              : {})}
            {...(ready && items.length > 0 ? {} : { reserveRows: narrow ? 6 : 8 })}
            {...(footer ? { footer } : {})}
          >
            {narrow ? (
              <PhoneFilters
                q={search.q}
                status={search.status}
                channel={search.channel}
                order={search.order}
                defaultOrder={defaultOrder}
                destinations={destinationList}
                isLoading={list.isPending}
                onQueryChange={(q) => onSearchChange({ q })}
                onApply={(next) => onSearchChange(next)}
              />
            ) : null}
            {narrow && ready && items.length > 0 ? <AppliedChips chips={chips} onRemove={removeChip} /> : null}
            {ready && items.length === 0 ? (
              emptyFiltered ? (
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
                rows={items}
                isLoading={list.isPending}
                post={post}
                channel={channel}
                activeId={search.id}
                onOpen={(id) => onSearchChange({ id })}
                order={order}
                onOrderChange={(next) => onSearchChange({ order: next })}
                controls={{
                  post: <SearchFilter q={search.q} onChange={(q) => onSearchChange({ q })} />,
                  channel: (
                    <PickFilter
                      label={copy.filters.channel}
                      filterLabel={copy.filters.channelFilter}
                      value={search.channel}
                      options={channelOptions}
                      onChange={(next) => onSearchChange({ channel: next })}
                    />
                  ),
                  status: (
                    <PickFilter
                      label={copy.filters.status}
                      filterLabel={copy.filters.statusFilter}
                      value={search.status}
                      options={statusOptions}
                      onChange={(next) =>
                        onSearchChange({ status: next as PublicationStatus | undefined, view: undefined })
                      }
                    />
                  )
                }}
              />
            )}
          </Panel>
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
