import type { DotaWatchlistDto } from '@alexeev/contracts';
import { ApiError } from '../../../shared/api/http-client';
import { Banner, Button, EmptyState, ErrorState, Menu, Panel, PanelList, PanelRow, Skeleton } from '../../../shared/ui';
import { useDotaWatchlists, useRemoveDotaWatchlist } from '../api/dota-watchlists-queries';
import styles from './DotaWatchlists.module.css';

const KIND = { hero: 'Герой', item: 'Предмет' } as const;

function mutationError(error: unknown): string {
  if (error instanceof ApiError && error.status === 409)
    return 'Список изменился. Проверьте текущее состояние и повторите действие вручную.';
  if (error instanceof ApiError && error.status === 0) return 'Нет соединения. Список не изменён.';
  if (error instanceof ApiError && error.requestId)
    return `Изменение не подтверждено сервером. Номер запроса: ${error.requestId}`;
  return 'Изменение не подтверждено сервером. Список сохранён.';
}

/** Settings → Общие: who the owner is told about when a patch changes them. Adding happens in the patch breakdown. */
export function DotaWatchlists() {
  const query = useDotaWatchlists();
  const remove = useRemoveDotaWatchlist();
  const watches: DotaWatchlistDto[] = query.data?.watches ?? [];

  return (
    <Panel title="Уведомлять, если в патче изменили">
      {query.isPending ? (
        <div className={styles.loading} aria-busy="true">
          <Skeleton height={36} />
        </div>
      ) : null}
      {!query.data && query.isError ? (
        <ErrorState
          message="Не удалось загрузить список."
          {...(query.error instanceof ApiError && query.error.requestId ? { requestId: query.error.requestId } : {})}
          onRetry={() => void query.refetch()}
        />
      ) : null}
      {query.data && watches.length === 0 ? (
        <EmptyState
          icon="bell"
          title="Вы пока ничего не отслеживаете"
          description="Откройте разбор патча в «Источниках» и нажмите «Следить» у героя или предмета."
        />
      ) : null}
      {watches.length > 0 ? (
        <PanelList aria-label="Отслеживаемые герои и предметы">
          {watches.map((watch) => (
            <PanelRow key={watch.id}>
              <div className={styles.row}>
                <div className={styles.identity}>
                  <strong>{watch.entityName}</strong>
                  <span>{KIND[watch.entityType]}</span>
                </div>
                <Menu
                  label={`Действия для ${watch.entityName}`}
                  items={[
                    {
                      id: 'remove',
                      label: `Не отслеживать: ${watch.entityName}`,
                      icon: 'x-circle',
                      isDisabled: remove.isPending && remove.variables === watch.id
                    }
                  ]}
                  onAction={(id) => {
                    if (id === 'remove') remove.mutate(watch.id);
                  }}
                />
              </div>
            </PanelRow>
          ))}
        </PanelList>
      ) : null}
      {remove.isError ? (
        <div className={styles.message}>
          <Banner
            tone="error"
            title="Не удалось убрать"
            action={
              <Button variant="secondary" size="sm" onPress={() => remove.reset()}>
                Понятно
              </Button>
            }
          >
            {mutationError(remove.error)}
          </Banner>
        </div>
      ) : null}
    </Panel>
  );
}
