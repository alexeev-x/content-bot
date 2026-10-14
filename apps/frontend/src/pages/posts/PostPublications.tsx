import { useInfiniteQuery } from '@tanstack/react-query';
import { destinationsInfiniteQueryOptions } from '../../features/destinations';
import { postsCopy, formatExact } from '../../features/posts';
import { isConfirmedSent, publicationsInfiniteQueryOptions } from '../../features/publications';
import { ApiError } from '../../shared/api/http-client';
import { ErrorState, Panel, Skeleton, StatusBadge } from '../../shared/ui';
import styles from './PostPages.module.css';

type Props = { postId: string };

const copy = postsCopy.publications;

/** Read-only summary of this post's publications. A bare `sent` without a Telegram message id is not shown as published. */
export function PostPublications({ postId }: Props) {
  const publications = useInfiniteQuery(publicationsInfiniteQueryOptions({ postId }));
  const destinations = useInfiniteQuery(destinationsInfiniteQueryOptions());
  const titles = new Map(destinations.data?.pages.flatMap((page) => page.items).map((item) => [item.id, item.title]));
  const items = publications.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <Panel>
      <div className={styles.pad}>
        {publications.isPending ? (
          <div aria-busy="true">
            <Skeleton lines={2} height={16} />
          </div>
        ) : publications.isError ? (
          <ErrorState
            message={copy.loadError}
            requestId={publications.error instanceof ApiError ? publications.error.requestId : undefined}
            onRetry={() => void publications.refetch()}
          />
        ) : items.length === 0 ? (
          <p className={styles.muted}>{copy.empty}</p>
        ) : (
          <ul className={styles.publications}>
            {items.map((publication) => (
              <li key={publication.id} className={styles.publication}>
                <span className={styles.publicationText}>
                  <strong>{titles.get(publication.destinationId) ?? publication.destinationId}</strong>
                  <span className={styles.muted}>{formatExact(publication.scheduledAt)}</span>
                </span>
                <StatusBadge
                  status={
                    publication.status === 'sent' && !isConfirmedSent(publication) ? 'unknown' : publication.status
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}
