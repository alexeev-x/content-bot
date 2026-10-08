import type { PostRevisionDto } from '@alexeev/contracts';
import { useInfiniteQuery } from '@tanstack/react-query';
import { ApiError } from '../../../shared/api/http-client';
import { Button, Drawer, ErrorState, Skeleton, StatusBadge } from '../../../shared/ui';
import { postRevisionsInfiniteQueryOptions } from '../api/posts-queries';
import { formatExact } from '../model/format-time';
import { EntityText } from './EntityText';
import { postsCopy } from './copy';
import styles from './PostRevisionHistory.module.css';

type Props = {
  postId: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
};

export function PostRevisionHistory({ postId, isOpen, onOpenChange }: Props) {
  const result = useInfiniteQuery({
    ...postRevisionsInfiniteQueryOptions(postId),
    enabled: isOpen
  });
  const revisions = result.data?.pages.flatMap((page) => page.items) ?? [];
  const selected = revisions[0];

  return (
    <Drawer isOpen={isOpen} onOpenChange={onOpenChange} title={postsCopy.editor.history.title}>
      {result.isPending ? (
        <div className={styles.layout} aria-busy="true">
          <Skeleton height={44} lines={4} />
          <Skeleton height={120} />
        </div>
      ) : result.isError ? (
        <ErrorState
          title={postsCopy.editor.history.errorTitle}
          message={postsCopy.editor.history.errorMessage}
          requestId={result.error instanceof ApiError ? result.error.requestId : undefined}
          onRetry={() => void result.refetch()}
        />
      ) : revisions.length === 0 ? (
        <p className={styles.muted}>{postsCopy.editor.history.empty}</p>
      ) : (
        <RevisionContent
          revisions={revisions}
          selected={selected}
          hasNextPage={result.hasNextPage}
          isFetchingNextPage={result.isFetchingNextPage}
          onLoadMore={() => void result.fetchNextPage()}
        />
      )}
    </Drawer>
  );
}

function RevisionContent({
  revisions,
  selected,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore
}: {
  revisions: PostRevisionDto[];
  selected: PostRevisionDto | undefined;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
}) {
  return (
    <div className={styles.layout}>
      <div className={styles.list} aria-label={postsCopy.editor.history.listLabel}>
        {revisions.map((revision) => (
          <article key={revision.revision} className={styles.item} data-selected={revision === selected}>
            <strong>{postsCopy.editor.revision(revision.revision)}</strong>
            <span className={styles.itemMeta}>{formatExact(revision.createdAt)}</span>
          </article>
        ))}
      </div>
      {selected ? (
        <section className={styles.detail} aria-label={postsCopy.editor.history.previewLabel}>
          <div className={styles.detailMeta}>
            <StatusBadge status={selected.status} />
            <span className={styles.muted}>{formatExact(selected.createdAt)}</span>
          </div>
          <h3 className={styles.title}>{selected.title}</h3>
          <p className={styles.body}>
            <EntityText text={selected.body} entities={selected.entities} />
          </p>
        </section>
      ) : null}
      {hasNextPage ? (
        <div className={styles.footer}>
          <Button variant="secondary" isLoading={isFetchingNextPage} onPress={onLoadMore}>
            {postsCopy.editor.history.loadMore}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
