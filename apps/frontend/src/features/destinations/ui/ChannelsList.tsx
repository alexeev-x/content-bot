import { useInfiniteQuery } from '@tanstack/react-query';
import { ApiError } from '../../../shared/api/http-client';
import { classifyApiError } from '../../../shared/api/error-kind';
import { Button, EmptyState, ErrorState, Panel, Skeleton } from '../../../shared/ui';
import { destinationsInfiniteQueryOptions } from '../api/destinations-queries';
import { ChannelRow } from './ChannelRow';
import { channelsCopy } from './copy';
import styles from './ChannelsList.module.css';

const copy = channelsCopy.list;

type Props = {
  rights: Readonly<Record<string, boolean>>;
  onOpen: (id: string) => void;
  onAdd: () => void;
};

/** Channels page body: loading, empty, error and the list, with an explicit «Показать ещё» (no infinite scroll). */
export function ChannelsList({ rights, onOpen, onAdd }: Props) {
  const query = useInfiniteQuery(destinationsInfiniteQueryOptions());

  if (query.isPending) {
    return (
      <Panel reserveRows={3}>
        <output className={styles.skeleton} aria-busy="true" aria-label={copy.loading}>
          {[0, 1, 2].map((key) => (
            <div key={key} className={styles.skeletonRow}>
              <Skeleton width={40} height={40} radius="var(--radius-pill)" />
              <Skeleton lines={2} height={14} />
              <Skeleton width={88} height={22} radius="var(--radius-pill)" />
            </div>
          ))}
        </output>
      </Panel>
    );
  }
  if (query.isError) {
    const forbidden = classifyApiError(query.error) === 'forbidden';
    return (
      <ErrorState
        message={forbidden ? copy.forbidden : copy.error}
        requestId={query.error instanceof ApiError ? query.error.requestId : undefined}
        {...(forbidden ? {} : { onRetry: () => void query.refetch() })}
      />
    );
  }

  const items = query.data.pages.flatMap((page) => page.items);
  if (items.length === 0) {
    return (
      <Panel reserveRows={3}>
        <EmptyState
          icon="channel"
          title={copy.empty.title}
          description={copy.empty.description}
          action={
            <Button icon="plus" onPress={onAdd}>
              {channelsCopy.add}
            </Button>
          }
        />
      </Panel>
    );
  }

  return (
    <>
      <Panel>
        <ul className={styles.list} aria-label={copy.label}>
          {items.map((destination) => (
            <ChannelRow
              key={destination.id}
              destination={destination}
              botCanPost={rights[destination.id]}
              onOpen={onOpen}
            />
          ))}
        </ul>
      </Panel>
      {query.hasNextPage ? (
        <div className={styles.more}>
          {query.isFetchNextPageError ? <p role="alert">{copy.loadMoreFailed}</p> : null}
          <Button variant="secondary" isLoading={query.isFetchingNextPage} onPress={() => void query.fetchNextPage()}>
            {copy.loadMore}
          </Button>
        </div>
      ) : null}
    </>
  );
}
