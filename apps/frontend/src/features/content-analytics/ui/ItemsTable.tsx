import type { ContentItemDto, ContentPlatform } from '@alexeev/contracts';
import { useMemo } from 'react';
import { DataTable, EmptyState, type DataColumn, Pagination, Panel, type TableSort } from '../../../shared/ui';
import { engagementRate, formatCount, formatPublished, PLATFORM_LABEL } from '../model/format';
import { multipleOf } from '../model/report';
import { copy } from './copy';
import { ItemThumb } from './ItemThumb';
import styles from './Report.module.css';

export const ITEMS_PER_PAGE = 10;
export type ItemsSortKey = 'published' | 'views' | 'likes' | 'comments' | 'er' | 'multiple';

type Props = {
  items: readonly ContentItemDto[] | undefined;
  medians: Partial<Record<ContentPlatform, number | null>>;
  timezone: string;
  page: number;
  onPageChange: (page: number) => void;
  sort: TableSort;
  onSortChange: (sort: TableSort) => void;
  activeId?: string | undefined;
  onOpen: (id: string) => void;
};

const SORTERS: Record<ItemsSortKey, (item: ContentItemDto, medians: Props['medians']) => number> = {
  published: (item) => Date.parse(item.publishedAt),
  views: (item) => item.views ?? -1,
  likes: (item) => item.likes ?? -1,
  comments: (item) => item.comments ?? -1,
  er: (item) => engagementRate(item) ?? -1,
  multiple: (item, medians) => multipleOf(item, medians) ?? -1
};

/** Every post and video of the period: sortable by any number, paged like the other tables. */
export function ItemsTable({
  items,
  medians,
  timezone,
  page,
  onPageChange,
  sort,
  onSortChange,
  activeId,
  onOpen
}: Props) {
  const sorted = useMemo(() => {
    if (!items) return [];
    const key = (sort.column in SORTERS ? sort.column : 'published') as ItemsSortKey;
    const direction = sort.direction === 'ascending' ? 1 : -1;
    return [...items].sort((a, b) => (SORTERS[key](a, medians) - SORTERS[key](b, medians)) * direction);
  }, [items, medians, sort]);
  const pageCount = Math.max(1, Math.ceil(sorted.length / ITEMS_PER_PAGE));
  const current = Math.min(page, pageCount);
  const rows = sorted.slice((current - 1) * ITEMS_PER_PAGE, current * ITEMS_PER_PAGE);

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
      {
        id: 'published',
        header: copy.table.published,
        width: 128,
        allowsSorting: true,
        cell: (item) => <span className={styles.nowrap}>{formatPublished(item.publishedAt, timezone)}</span>
      },
      {
        id: 'views',
        header: copy.table.views,
        width: 100,
        align: 'end',
        allowsSorting: true,
        compactSlot: 'trailing',
        cell: (item) => <span className={styles.num}>{formatCount(item.views)}</span>
      },
      {
        id: 'multiple',
        header: copy.table.multiple,
        width: 104,
        align: 'end',
        allowsSorting: true,
        cell: (item) => {
          const multiple = multipleOf(item, medians);
          return (
            <span
              className={styles.multipleCell}
              data-tone={multiple === null ? 'flat' : multiple >= 1.5 ? 'up' : multiple <= 0.5 ? 'down' : 'flat'}
            >
              {multiple === null ? '—' : `${multiple.toLocaleString('ru-RU')}×`}
            </span>
          );
        }
      },
      {
        id: 'likes',
        header: copy.table.likes,
        width: 92,
        align: 'end',
        allowsSorting: true,
        cell: (item) => <span className={styles.num}>{formatCount(item.likes)}</span>
      },
      {
        id: 'comments',
        header: copy.table.comments,
        width: 124,
        align: 'end',
        allowsSorting: true,
        cell: (item) => <span className={styles.num}>{formatCount(item.comments)}</span>
      },
      {
        id: 'er',
        header: copy.table.er,
        width: 132,
        align: 'end',
        allowsSorting: true,
        cell: (item) => {
          const rate = engagementRate(item);
          return <span className={styles.num}>{rate === null ? '—' : `${rate.toLocaleString('ru-RU')}%`}</span>;
        }
      }
    ],
    [timezone, medians]
  );

  return (
    <Panel
      title={copy.table.title}
      headingLevel={2}
      quiet
      footer={
        <Pagination
          page={current}
          pageSize={ITEMS_PER_PAGE}
          totalCount={sorted.length}
          onPageChange={onPageChange}
          isLoading={items === undefined}
        />
      }
    >
      <DataTable
        aria-label={copy.table.label}
        columns={columns}
        rows={rows}
        getRowId={(item) => item.id}
        getRowText={(item) => `${item.title} ${PLATFORM_LABEL[item.platform]}`}
        sort={sort}
        onSortChange={onSortChange}
        onRowAction={onOpen}
        activeId={activeId}
        isLoading={items === undefined}
        loadingRows={ITEMS_PER_PAGE}
        density="compact"
        flush
        emptyState={<EmptyState icon="chart" title={copy.table.empty} description={copy.table.emptyHint} />}
      />
    </Panel>
  );
}
