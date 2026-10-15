import type { ContentItemDto, ContentPlatform } from '@alexeev/contracts';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import {
  Button,
  DataTable,
  EmptyState,
  ErrorState,
  type DataColumn,
  FooterLine,
  Panel,
  SegmentedControl
} from '../../../shared/ui';
import { contentItemsQueryOptions } from '../api/content-analytics-queries';
import { engagementRate, formatCount, formatPublished, PLATFORM_LABEL } from '../model/format';
import { copy } from './copy';
import styles from './ContentAnalytics.module.css';
import { ItemThumb } from './ItemThumb';

type Props = {
  platform: ContentPlatform | undefined;
  onPlatformChange: (platform: ContentPlatform | undefined) => void;
  timezone: string;
  activeId?: string | undefined;
  onOpen: (id: string) => void;
};

const FILTERS = [
  { id: 'all', label: copy.table.all },
  { id: 'telegram', label: PLATFORM_LABEL.telegram },
  { id: 'youtube', label: PLATFORM_LABEL.youtube },
  { id: 'tiktok', label: PLATFORM_LABEL.tiktok }
] as const;

export function ItemsTable({ platform, onPlatformChange, timezone, activeId, onOpen }: Props) {
  const query = useInfiniteQuery(contentItemsQueryOptions(platform));
  const rows = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data]);

  const columns = useMemo<DataColumn<ContentItemDto>[]>(
    () => [
      {
        id: 'item',
        header: copy.table.item,
        isRowHeader: true,
        cell: (item) => (
          <span className={styles.itemCell}>
            <ItemThumb item={item} />
            <span className={styles.itemTitle}>{item.title || copy.table.untitled}</span>
          </span>
        )
      },
      { id: 'platform', header: copy.table.platform, width: 110, cell: (item) => PLATFORM_LABEL[item.platform] },
      {
        id: 'published',
        header: copy.table.published,
        width: 140,
        cell: (item) => <span className={styles.num}>{formatPublished(item.publishedAt, timezone)}</span>
      },
      {
        id: 'views',
        header: copy.table.views,
        width: 110,
        align: 'end',
        compactSlot: 'trailing',
        cell: (item) => <span className={styles.num}>{formatCount(item.views)}</span>
      },
      {
        id: 'likes',
        header: copy.table.likes,
        width: 150,
        align: 'end',
        cell: (item) => <span className={styles.num}>{formatCount(item.likes)}</span>
      },
      {
        id: 'comments',
        header: copy.table.comments,
        width: 120,
        align: 'end',
        cell: (item) => <span className={styles.num}>{formatCount(item.comments)}</span>
      },
      {
        id: 'er',
        header: copy.table.er,
        width: 140,
        align: 'end',
        cell: (item) => {
          const rate = engagementRate(item);
          return <span className={styles.num}>{rate === null ? '—' : `${rate.toLocaleString('ru-RU')} %`}</span>;
        }
      }
    ],
    [timezone]
  );

  const failed = query.isError && rows.length === 0;
  return (
    <Panel
      title={copy.table.title}
      headingLevel={2}
      action={
        <SegmentedControl
          label={copy.table.filter}
          options={FILTERS}
          value={platform ?? 'all'}
          onChange={(id) => onPlatformChange(id === 'all' ? undefined : (id as ContentPlatform))}
        />
      }
      footer={
        rows.length > 0 ? (
          <FooterLine
            text={copy.table.shown(rows.length)}
            action={
              query.hasNextPage ? (
                <Button
                  size="sm"
                  variant="ghost"
                  isLoading={query.isFetchingNextPage}
                  onPress={() => void query.fetchNextPage()}
                >
                  {copy.table.more}
                </Button>
              ) : undefined
            }
          />
        ) : undefined
      }
    >
      {failed ? (
        <ErrorState message={copy.table.error} onRetry={() => void query.refetch()} />
      ) : (
        <DataTable
          aria-label={copy.table.label}
          columns={columns}
          rows={rows}
          getRowId={(item) => item.id}
          getRowText={(item) => `${item.title} ${PLATFORM_LABEL[item.platform]}`}
          onRowAction={onOpen}
          activeId={activeId}
          isLoading={query.isPending}
          density="compact"
          flush
          emptyState={<EmptyState icon="chart" title={copy.table.empty} description={copy.table.emptyHint} />}
        />
      )}
    </Panel>
  );
}
