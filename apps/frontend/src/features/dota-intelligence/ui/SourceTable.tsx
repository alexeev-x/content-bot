import type { SourceEventView } from '@alexeev/contracts';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { ApiError } from '../../../shared/api/http-client';
import { PAGE_SIZE } from '../../../shared/api/page-query';
import { useNow } from '../../../shared/lib/use-now';
import { groupByDay } from '../../../shared/lib/group-by-day';
import {
  Banner,
  EmptyState,
  ErrorState,
  GroupedList,
  ListRow,
  ListRowSkeleton,
  Pagination,
  Panel,
  PanelList,
  Select
} from '../../../shared/ui';
import { sourceEventsQueryOptions } from '../api/sources-queries';
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

function clock(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('ru-RU', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(
    new Date(iso)
  );
}

type Props = {
  state: SourceTableView;
  timezone: string;
  onChange: (patch: Partial<SourceTableView>) => void;
};

export function SourceTable({ state, timezone, onChange }: Props) {
  const now = useNow().getTime();
  const query = useQuery(sourceEventsQueryOptions({ view: state.view, page: state.page, limit: PAGE_SIZE }));
  const totalCount = query.data?.totalCount ?? 0;
  const lastPage = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  // A page emptied by hiding falls back to the new last page.
  useEffect(() => {
    if (query.data && !query.isPlaceholderData && state.page > lastPage) onChange({ page: lastPage });
  }, [query.data, query.isPlaceholderData, state.page, lastPage, onChange]);

  const items = useMemo(() => query.data?.items ?? [], [query.data]);
  const days = useMemo(() => groupByDay(items, (event) => event.publishedAt, timezone), [items, timezone]);
  // One source for every shown event is said once above the list instead of on each row.
  const commonSource =
    items.length > 1 && items.every((event) => event.sourceName === items[0]?.sourceName)
      ? items[0]?.sourceName
      : undefined;

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
      ) : query.isPending ? (
        <PanelList aria-label="Загрузка событий">
          {Array.from({ length: 8 }, (_, index) => (
            <ListRowSkeleton key={index} />
          ))}
        </PanelList>
      ) : items.length === 0 ? (
        <EmptyState
          size="compact"
          icon="bell"
          title={EMPTY[state.view].title}
          description={EMPTY[state.view].description}
        />
      ) : (
        <div className={styles.list}>
          {commonSource ? <p className={styles.common}>Источник: {commonSource}</p> : null}
          <GroupedList
            variant="chip"
            stickyHeaders
            groups={days.map((day) => ({ id: day.key, label: day.label, count: day.items.length }))}
          >
            {(id) => (
              <PanelList aria-label="События источников">
                {(days.find((day) => day.key === id)?.items ?? []).map((event) => (
                  <ListRow
                    key={event.id}
                    title={event.title}
                    leading={
                      <time dateTime={event.publishedAt} title={`${event.publishedAt} (${timezone})`}>
                        {clock(event.publishedAt, timezone)}
                      </time>
                    }
                    meta={commonSource ? TYPE_LABEL[event.type] : `${TYPE_LABEL[event.type]} · ${event.sourceName}`}
                    status={<EventStatus event={event} />}
                    isActive={state.open === event.id}
                    onPress={() => onChange({ open: event.id })}
                  />
                ))}
              </PanelList>
            )}
          </GroupedList>
        </div>
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
