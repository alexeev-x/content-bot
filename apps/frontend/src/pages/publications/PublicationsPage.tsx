import type { PublicationStatus } from '@alexeev/contracts';
import { useEffect, useRef, useState } from 'react';
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
import { Button, EmptyState, ErrorState, PageHeader, VisuallyHidden } from '../../shared/ui';
import styles from './PublicationsPage.module.css';
import { PublicationsFilters } from './PublicationsFilters';
import type { PublicationsSearch } from './search';
import { useDocumentTitle } from './use-document-title';
import { usePublicationsData } from './use-publications-data';

type Props = {
  search: PublicationsSearch;
  /** Merges into the URL search; filters and the page cursor are history entries, the drawer id too. */
  onSearchChange: (patch: Partial<PublicationsSearch>, options?: { replace?: boolean }) => void;
  onOpenPosts: () => void;
  /** Test hook: poll interval in ms (production uses the feature default of 15 s). */
  pollMs?: number;
};

const copy = publicationCopy;

export function PublicationsPage({ search, onSearchChange, onOpenPosts, pollMs }: Props) {
  useDocumentTitle(copy.list.title);
  const { list, destinationList, postTitle, channel } = usePublicationsData(search, pollMs);
  const items = list.data?.items ?? [];
  const hasFilters = search.status !== undefined || search.channel !== undefined || search.post !== undefined;
  const announcement = useStatusAnnouncement(items);
  // The offset is read once per visit: it only changes at a DST switch, and render must stay pure.
  const [zoneNote] = useState(() => {
    const zone = browserTimeZone();
    return copy.drawer.timelineZone(zone, utcOffsetLabel(new Date(), zone));
  });
  const polling = items.some((item) => isInProgress(item.status));

  const openRow = search.id ? items.find((item) => item.id === search.id) : undefined;
  const openDestination = openRow ? channel(openRow) : undefined;

  const reset = () => onSearchChange({ status: undefined, channel: undefined, post: undefined, cursor: undefined });

  return (
    <>
      <PageHeader title={copy.list.title} description={copy.list.description} />
      <PublicationsFilters
        status={search.status}
        channel={search.channel}
        destinations={destinationList}
        onStatusChange={(status) => onSearchChange({ status, cursor: undefined })}
        onChannelChange={(next) => onSearchChange({ channel: next, cursor: undefined })}
        onReset={reset}
      />
      {search.post ? (
        <p className={styles.note}>
          {copy.list.onePost}{' '}
          <Button variant="ghost" size="sm" onPress={() => onSearchChange({ post: undefined, cursor: undefined })}>
            {copy.list.allPosts}
          </Button>
        </p>
      ) : null}
      <p className={styles.note}>
        {zoneNote}
        {polling ? ` ${copy.states.polling}` : ''}
      </p>
      <VisuallyHidden>
        <output aria-live="polite">{announcement}</output>
      </VisuallyHidden>

      {list.isError ? (
        <ListError error={list.error} onRetry={() => void list.refetch()} />
      ) : (
        <div className={styles.results}>
          <PublicationTable
            rows={items}
            isLoading={list.isPending}
            postTitle={postTitle}
            channel={channel}
            onOpen={(id) => onSearchChange({ id })}
            emptyState={
              hasFilters || search.cursor ? (
                <EmptyState
                  icon="search"
                  title={copy.states.filteredTitle}
                  description={copy.states.filteredDescription}
                  action={
                    <Button variant="secondary" onPress={reset}>
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
            }
          />
          {search.cursor || list.data?.nextCursor ? (
            <nav className={styles.pager} aria-label={copy.pagination.label}>
              {search.cursor ? (
                <Button variant="secondary" icon="chevron-left" onPress={() => onSearchChange({ cursor: undefined })}>
                  {copy.pagination.first}
                </Button>
              ) : null}
              {list.data?.nextCursor ? (
                <Button
                  variant="secondary"
                  onPress={() => onSearchChange({ cursor: list.data?.nextCursor ?? undefined })}
                >
                  {copy.pagination.next}
                </Button>
              ) : null}
            </nav>
          ) : null}
        </div>
      )}

      <PublicationDrawer
        publicationId={search.id ?? null}
        isOpen={search.id !== undefined}
        onOpenChange={(open) => {
          if (!open) onSearchChange({ id: undefined }, { replace: true });
        }}
        placeholder={openRow}
        postTitle={openRow ? postTitle(openRow) : undefined}
        destinationTitle={openDestination?.title}
        chatId={openDestination?.chatId}
        pollMs={pollMs}
      />
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
