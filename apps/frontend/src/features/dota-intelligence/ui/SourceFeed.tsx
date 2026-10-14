import type { SourceEventDto, SourceEventStatus } from '@alexeev/contracts';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { ApiError } from '../../../shared/api/http-client';
import { PAGE_SIZE } from '../../../shared/api/page-query';
import { useNow } from '../../../shared/lib/use-now';
import {
  Banner,
  EmptyState,
  ErrorState,
  Pagination,
  Panel,
  PanelList,
  PanelRow,
  Select,
  Skeleton
} from '../../../shared/ui';
import { sourceEventsQueryOptions, useCreateSourceEventDraft, useSetSourceEventHidden } from '../api/sources-queries';
import { SourceEventCard } from './SourceEventCard';
import styles from './SourceFeed.module.css';

export type FeedFilters = { status: SourceEventStatus; page: number };

const STATUS_OPTIONS = [
  { id: 'new', label: 'Новые' },
  { id: 'drafted', label: 'Черновики' },
  { id: 'published', label: 'Опубликованные' },
  { id: 'hidden', label: 'Пропущенные' }
] as const;
const EMPTY: Record<SourceEventStatus, { title: string; description: string }> = {
  new: {
    title: 'Новых событий пока нет',
    description:
      'Здесь появятся патчи, обновления сокровищницы и новости Dota 2, как только их опубликует Valve. Каждое можно превратить в черновик поста одним нажатием.'
  },
  drafted: { title: 'Черновиков из событий нет', description: 'Нажмите «Сделать пост» у нового события.' },
  published: {
    title: 'Опубликованных событий нет',
    description: 'Здесь появятся события, чьи посты уже вышли в канал.'
  },
  hidden: { title: 'Пропущенных событий нет', description: 'Пропущенное событие можно вернуть в ленту.' }
};

type Props = { filters: FeedFilters; timezone: string; onFiltersChange: (patch: Partial<FeedFilters>) => void };

export function SourceFeed({ filters, timezone, onFiltersChange }: Props) {
  const now = useNow();
  const navigate = useNavigate();
  const query = useQuery(
    sourceEventsQueryOptions({
      status: filters.status,
      page: filters.page,
      limit: PAGE_SIZE
    })
  );
  const draft = useCreateSourceEventDraft();
  const visibility = useSetSourceEventHidden();
  const [actionId, setActionId] = useState<string | null>(null);

  const totalCount = query.data?.totalCount ?? 0;
  const lastPage = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  // A page emptied by hiding falls back to the new last page.
  useEffect(() => {
    if (query.data && !query.isPlaceholderData && filters.page > lastPage) onFiltersChange({ page: lastPage });
  }, [query.data, query.isPlaceholderData, filters.page, lastPage, onFiltersChange]);

  const makeDraft = (event: SourceEventDto) => {
    setActionId(event.id);
    visibility.reset();
    draft.mutate(event.id, {
      onSuccess: (result) => {
        if (result.event.draft) void navigate({ to: '/posts/$id', params: { id: result.event.draft.postId } });
      }
    });
  };
  const setHidden = (event: SourceEventDto, hidden: boolean) => {
    setActionId(event.id);
    draft.reset();
    visibility.mutate({ id: event.id, hidden });
  };

  const actionError = draft.error ?? visibility.error;
  const hiddenConflict = actionError instanceof ApiError && actionError.reason === 'EVENT_HIDDEN';
  const toolbar = (
    <div className={styles.toolbar}>
      {/* A compact select on every screen: the status is the only filter of the feed. */}
      <Select
        label="Статус"
        inlineLabel
        options={STATUS_OPTIONS}
        value={filters.status}
        onChange={(status) => onFiltersChange({ status: status as SourceEventStatus, page: 1 })}
      />
    </div>
  );

  if (query.isPending) {
    return (
      <div className={styles.feed}>
        {toolbar}
        <Panel
          reserveRows={3}
          footer={<Pagination page={1} pageSize={PAGE_SIZE} totalCount={0} onPageChange={() => {}} isLoading />}
        >
          <div className={styles.skeleton} aria-busy="true">
            <Skeleton height={140} />
            <Skeleton height={140} />
          </div>
        </Panel>
      </div>
    );
  }
  if (!query.data) {
    const requestId = query.error instanceof ApiError ? query.error.requestId : undefined;
    return (
      <div className={styles.feed}>
        {toolbar}
        <ErrorState
          message="Не удалось загрузить ленту событий. Данные не потеряны, повторите загрузку."
          {...(requestId ? { requestId } : {})}
          onRetry={() => void query.refetch()}
        />
      </div>
    );
  }

  const items = query.data.items;
  return (
    <div className={styles.feed}>
      {toolbar}
      {actionError ? (
        <Banner
          tone={hiddenConflict ? 'warning' : 'error'}
          title={hiddenConflict ? 'Событие пропущено' : 'Действие не подтверждено сервером'}
        >
          {hiddenConflict ? 'Верните его в ленту, чтобы сделать пост.' : 'Ничего не изменилось, повторите действие.'}
          {actionError instanceof ApiError && actionError.requestId ? ` Номер запроса: ${actionError.requestId}` : ''}
        </Banner>
      ) : null}
      {query.isRefetchError ? (
        <Banner tone="warning" title="Показаны сохранённые данные">
          Не удалось обновить ленту.
        </Banner>
      ) : null}
      <Panel
        footer={
          <Pagination
            page={filters.page}
            pageSize={PAGE_SIZE}
            totalCount={totalCount}
            onPageChange={(page) => onFiltersChange({ page })}
          />
        }
      >
        {items.length === 0 ? (
          <EmptyState icon="bell" title={EMPTY[filters.status].title} description={EMPTY[filters.status].description} />
        ) : (
          <PanelList aria-label="События источников">
            {items.map((event) => (
              <PanelRow key={event.id}>
                <SourceEventCard
                  event={event}
                  now={now.getTime()}
                  timezone={timezone}
                  busy={
                    actionId === event.id
                      ? draft.isPending
                        ? 'draft'
                        : visibility.isPending
                          ? 'visibility'
                          : null
                      : null
                  }
                  onMakeDraft={makeDraft}
                  onSetHidden={setHidden}
                  onOpenDraft={(id) => void navigate({ to: '/posts/$id', params: { id } })}
                  onPublish={(id) => void navigate({ to: '/posts/$id/publish', params: { id } })}
                />
              </PanelRow>
            ))}
          </PanelList>
        )}
      </Panel>
    </div>
  );
}
