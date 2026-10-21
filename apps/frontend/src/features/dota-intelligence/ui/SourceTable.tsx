import type { SourceEventDto, SourceEventView } from '@alexeev/contracts';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { ApiError } from '../../../shared/api/http-client';
import { PAGE_SIZE } from '../../../shared/api/page-query';
import { useNow } from '../../../shared/lib/use-now';
import {
  Banner,
  type DataColumn,
  DataTable,
  EmptyState,
  ErrorState,
  Pagination,
  Panel,
  Select
} from '../../../shared/ui';
import { sourceEventsQueryOptions } from '../api/sources-queries';
import { DotaTime } from './DotaTime';
import { EventStatus, TYPE_LABEL } from './event-status';
import { SourceEventDrawer } from './SourceEventDrawer';
import styles from './SourceTable.module.css';

export type SourceTableView = { view: SourceEventView; page: number; open: string | undefined };

// One list instead of a status switch (owner, 21.10.2026); the status is a column. «Прошлые анонсы» is temporary:
// it lets the AI be tried on announcements from before the watcher started.
const VIEW_OPTIONS = [
  { id: 'active', label: 'События' },
  { id: 'hidden', label: 'Пропущенные' },
  { id: 'past', label: 'Прошлые анонсы (тест)' }
] as const;
const EMPTY: Record<SourceEventView, { title: string; description: string }> = {
  active: {
    title: 'Событий пока нет',
    description: 'Здесь появятся патчи, сокровищницы и новости Dota 2, как только их опубликует Valve.'
  },
  hidden: { title: 'Пропущенных событий нет', description: 'Пропущенное событие можно вернуть из его панели.' },
  past: { title: 'Прошлых анонсов нет', description: 'Все анонсы Steam уже в списке событий.' }
};

type Props = { state: SourceTableView; timezone: string; onChange: (patch: Partial<SourceTableView>) => void };

export function SourceTable({ state, timezone, onChange }: Props) {
  const now = useNow().getTime();
  const query = useQuery(sourceEventsQueryOptions({ view: state.view, page: state.page, limit: PAGE_SIZE }));
  const totalCount = query.data?.totalCount ?? 0;
  const lastPage = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  // A page emptied by hiding falls back to the new last page.
  useEffect(() => {
    if (query.data && !query.isPlaceholderData && state.page > lastPage) onChange({ page: lastPage });
  }, [query.data, query.isPlaceholderData, state.page, lastPage, onChange]);

  const columns = useMemo<DataColumn<SourceEventDto>[]>(
    () => [
      {
        id: 'title',
        header: 'Событие',
        isRowHeader: true,
        cell: (event) => (
          <span className={styles.titleCell}>
            <span className={styles.title}>{event.title}</span>
            <span className={styles.meta}>
              {TYPE_LABEL[event.type]} · {event.sourceName}
            </span>
          </span>
        )
      },
      {
        id: 'date',
        header: 'Опубликовано',
        width: 160,
        cell: (event) => (
          <span className={styles.nowrap}>
            <DotaTime iso={event.publishedAt} now={now} timezone={timezone} />
          </span>
        )
      },
      {
        id: 'status',
        header: 'Статус',
        width: 200,
        compactSlot: 'trailing',
        cell: (event) => <EventStatus event={event} />
      }
    ],
    [now, timezone]
  );

  const opened = query.data?.items.find((event) => event.id === state.open);
  const requestId = query.error instanceof ApiError ? query.error.requestId : undefined;
  return (
    <Panel
      title="События"
      headingLevel={2}
      quiet
      action={
        <Select
          label="Показать"
          inlineLabel
          options={VIEW_OPTIONS}
          value={state.view}
          onChange={(view) => onChange({ view: view as SourceEventView, page: 1, open: undefined })}
        />
      }
      footer={
        <Pagination
          page={state.page}
          pageSize={PAGE_SIZE}
          totalCount={totalCount}
          onPageChange={(page) => onChange({ page })}
          isLoading={query.isPending}
        />
      }
    >
      {query.isRefetchError ? (
        <Banner tone="warning" title="Показаны сохранённые данные">
          Не удалось обновить список.
        </Banner>
      ) : null}
      {query.isError && query.data === undefined ? (
        <ErrorState
          message="Не удалось загрузить события. Данные не потеряны, повторите загрузку."
          {...(requestId ? { requestId } : {})}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <DataTable
          aria-label="События источников"
          columns={columns}
          rows={query.data?.items ?? []}
          getRowId={(event) => event.id}
          getRowText={(event) => `${event.title}, ${TYPE_LABEL[event.type]}`}
          onRowAction={(id) => onChange({ open: id })}
          activeId={state.open}
          isLoading={query.isPending}
          loadingRows={PAGE_SIZE}
          density="compact"
          rowHeight="tall"
          flush
          emptyState={
            <EmptyState icon="bell" title={EMPTY[state.view].title} description={EMPTY[state.view].description} />
          }
        />
      )}
      <SourceEventDrawer
        key={state.open ?? 'closed'}
        event={opened}
        now={now}
        timezone={timezone}
        onClose={() => onChange({ open: undefined })}
      />
    </Panel>
  );
}
