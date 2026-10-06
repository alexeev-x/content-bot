import type { PostDto, PostStatus } from '@alexeev/contracts';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { ru } from '../../../shared/lib/ru';
import { classifyApiError } from '../../../shared/api/error-kind';
import { ApiError } from '../../../shared/api/http-client';
import {
  Button,
  DataTable,
  EmptyState,
  ErrorState,
  SearchField,
  SegmentedControl,
  StatusBadge,
  type DataColumn
} from '../../../shared/ui';
import { postsInfiniteQueryOptions } from '../api/posts-queries';
import { excerptOf, filterPostsByText } from '../model/excerpt';
import { formatExact, formatRelative } from '../model/format-time';
import { useNow } from '../model/use-now';
import { postsCopy } from './copy';
import styles from './PostsList.module.css';

type Props = {
  status: PostStatus | undefined;
  query: string;
  onStatusChange: (status: PostStatus | undefined) => void;
  onQueryChange: (query: string) => void;
  onOpen: (id: string) => void;
  onCreate: () => void;
};

const copy = postsCopy.list;
const ALL = 'all';

const STATUS_OPTIONS = [
  { id: ALL, label: copy.allStatuses },
  { id: 'draft', label: ru.status.draft },
  { id: 'approved', label: ru.status.approved }
] as const;

export function PostsList({ status, query, onStatusChange, onQueryChange, onOpen, onCreate }: Props) {
  const now = useNow();
  const result = useInfiniteQuery(postsInfiniteQueryOptions(status ? { status } : {}));
  const loaded = useMemo(() => result.data?.pages.flatMap((page) => page.items) ?? [], [result.data]);
  const rows = useMemo(() => filterPostsByText(loaded, query), [loaded, query]);
  const isFiltered = status !== undefined || query.trim() !== '';

  const columns: DataColumn<PostDto>[] = [
    {
      id: 'title',
      header: copy.columns.title,
      isRowHeader: true,
      cell: (post) => (
        <span className={styles.titleCell}>
          <strong className={styles.title}>{post.title.trim() || copy.untitled}</strong>
          <span className={styles.excerpt}>{excerptOf(post.body) || copy.emptyBody}</span>
        </span>
      )
    },
    { id: 'status', header: copy.columns.status, cell: (post) => <StatusBadge status={post.status} /> },
    {
      id: 'updated',
      header: copy.columns.updated,
      cell: (post) => (
        <time
          dateTime={post.updatedAt}
          title={formatExact(post.updatedAt)}
          className={`${styles.muted} ${styles.time}`}
        >
          {formatRelative(post.updatedAt, now)}
        </time>
      )
    },
    {
      id: 'revision',
      header: copy.columns.revision,
      align: 'end',
      cell: (post) => <span className={`mono ${styles.muted}`}>{copy.revision(post.revision)}</span>
    }
  ];

  const reset = () => {
    onStatusChange(undefined);
    onQueryChange('');
  };

  return (
    <section className={styles.list}>
      <div className={styles.toolbar}>
        <div className={styles.search}>
          <SearchField
            label={copy.searchLabel}
            placeholder={copy.searchPlaceholder}
            value={query}
            onChange={onQueryChange}
          />
        </div>
        <SegmentedControl
          label={copy.statusFilter}
          options={STATUS_OPTIONS}
          value={status ?? ALL}
          onChange={(id) => onStatusChange(id === ALL ? undefined : (id as PostStatus))}
        />
      </div>

      {result.isError ? (
        <ListError error={result.error} onRetry={() => void result.refetch()} />
      ) : !result.isPending && rows.length === 0 ? (
        <EmptyState
          icon="file"
          title={isFiltered ? copy.filteredEmptyTitle : copy.emptyTitle}
          description={isFiltered ? copy.filteredEmptyDescription : copy.emptyDescription}
          action={
            isFiltered ? (
              <Button variant="secondary" onPress={reset}>
                {copy.resetFilters}
              </Button>
            ) : (
              <Button icon="plus" onPress={onCreate}>
                {copy.create}
              </Button>
            )
          }
        />
      ) : (
        <DataTable
          aria-label={copy.tableLabel}
          columns={columns}
          rows={rows}
          getRowId={(post) => post.id}
          isLoading={result.isPending}
          onRowAction={onOpen}
        />
      )}

      {!result.isPending && !result.isError ? (
        <div className={styles.footer}>
          <output className={styles.muted}>{copy.loaded(loaded.length)}</output>
          {query.trim() !== '' && result.hasNextPage ? <span className={styles.muted}>{copy.searchScope}</span> : null}
          {result.isFetchNextPageError ? <span className={styles.failed}>{copy.loadMoreFailed}</span> : null}
          {result.hasNextPage ? (
            <Button
              variant="secondary"
              isLoading={result.isFetchingNextPage}
              onPress={() => void result.fetchNextPage()}
            >
              {result.isFetchingNextPage ? copy.loadingMore : copy.loadMore}
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function ListError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const forbidden = classifyApiError(error) === 'forbidden';
  return forbidden ? (
    <ErrorState title={copy.forbiddenTitle} message={copy.forbiddenMessage} />
  ) : (
    <ErrorState
      title={copy.errorTitle}
      message={copy.errorMessage}
      requestId={error instanceof ApiError ? error.requestId : undefined}
      onRetry={onRetry}
    />
  );
}
