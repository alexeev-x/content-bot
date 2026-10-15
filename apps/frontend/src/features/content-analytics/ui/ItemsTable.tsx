import type { ContentBaselineDto, ContentItemDto, ContentPlatform } from '@alexeev/contracts';
import { useMemo, useState } from 'react';
import {
  DataTable,
  EmptyState,
  type DataColumn,
  Pagination,
  Panel,
  SearchField,
  Select,
  type TableSort
} from '../../../shared/ui';
import { engagementRate, formatCount, formatPublished, PLATFORM_LABEL } from '../model/format';
import { multipleOf } from '../model/report';
import { type ItemStatus, verdictFor } from '../model/status';
import { copy } from './copy';
import { ItemThumb } from './ItemThumb';
import styles from './Report.module.css';
import { StatusChip } from './StatusChip';

export const ITEMS_PER_PAGE = 10;
export type ItemsSortKey = 'published' | 'views' | 'likes' | 'comments' | 'er' | 'multiple';

type Props = {
  items: readonly ContentItemDto[] | undefined;
  medians: Partial<Record<ContentPlatform, number | null>>;
  baselines: readonly ContentBaselineDto[];
  now: number;
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

const STATUS_FILTERS = [
  { id: 'all', label: 'Все' },
  { id: 'rising', label: 'Залетает, выше нормы' },
  { id: 'normal', label: 'В норме' },
  { id: 'below', label: 'Ниже нормы' },
  { id: 'collecting', label: 'Собираем данные' }
] as const;

/** «Все публикации»: search, status filter, sort by any number, a status per row; paged like the other tables. */
export function ItemsTable({
  items,
  medians,
  baselines,
  now,
  timezone,
  page,
  onPageChange,
  sort,
  onSortChange,
  activeId,
  onOpen
}: Props) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<ItemStatus | 'all'>('all');
  const verdicts = useMemo(
    () => new Map((items ?? []).map((item) => [item.id, verdictFor(item, now, baselines, medians)])),
    [items, now, baselines, medians]
  );
  const sorted = useMemo(() => {
    if (!items) return [];
    const needle = search.trim().toLocaleLowerCase('ru-RU');
    const key = (sort.column in SORTERS ? sort.column : 'published') as ItemsSortKey;
    const direction = sort.direction === 'ascending' ? 1 : -1;
    return items
      .filter(
        (item) =>
          (needle === '' || item.title.toLocaleLowerCase('ru-RU').includes(needle)) &&
          (status === 'all' || verdicts.get(item.id)?.status === status)
      )
      .sort((a, b) => (SORTERS[key](a, medians) - SORTERS[key](b, medians)) * direction);
  }, [items, medians, sort, search, status, verdicts]);
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
            <span className={styles.cellStack}>
              <span className={styles.itemTitle}>{item.title || copy.table.untitled}</span>
              <span className={styles.cellDelta} data-tone="flat">
                {PLATFORM_LABEL[item.platform]}
              </span>
            </span>
          </span>
        )
      },
      {
        id: 'published',
        header: 'Дата',
        width: 104,
        allowsSorting: true,
        cell: (item) => <span className={styles.nowrap}>{formatPublished(item.publishedAt, timezone)}</span>
      },
      {
        id: 'views',
        header: copy.table.views,
        width: 104,
        align: 'end',
        allowsSorting: true,
        compactSlot: 'trailing',
        cell: (item) => <span className={styles.num}>{formatCount(item.views)}</span>
      },
      {
        id: 'multiple',
        header: 'К норме',
        width: 92,
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
        width: 80,
        align: 'end',
        allowsSorting: true,
        cell: (item) => <span className={styles.num}>{formatCount(item.likes)}</span>
      },
      {
        id: 'comments',
        header: 'Комм.',
        width: 84,
        align: 'end',
        allowsSorting: true,
        cell: (item) => <span className={styles.num}>{formatCount(item.comments)}</span>
      },
      {
        id: 'er',
        header: 'ER',
        width: 72,
        align: 'end',
        allowsSorting: true,
        cell: (item) => {
          const rate = engagementRate(item);
          return <span className={styles.num}>{rate === null ? '—' : `${rate.toLocaleString('ru-RU')}%`}</span>;
        }
      },
      {
        id: 'status',
        header: 'Статус',
        width: 148,
        cell: (item) => {
          const verdict = verdicts.get(item.id);
          return verdict ? <StatusChip verdict={verdict} /> : null;
        }
      }
    ],
    [timezone, medians, verdicts, onOpen]
  );

  return (
    <Panel
      title={copy.table.title}
      headingLevel={2}
      quiet
      note={items ? `${items.length} публ. за период` : undefined}
      action={
        <div className={styles.tableTools}>
          <SearchField
            label="Поиск по названию"
            placeholder="Поиск по названию…"
            value={search}
            onChange={(value) => {
              setSearch(value);
              onPageChange(1);
            }}
          />
          <Select
            label="Статус"
            inlineLabel
            options={STATUS_FILTERS}
            value={status}
            onChange={(id) => {
              setStatus(id as ItemStatus | 'all');
              onPageChange(1);
            }}
          />
        </div>
      }
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
