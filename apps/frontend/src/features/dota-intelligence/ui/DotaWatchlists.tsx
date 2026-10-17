import type { DotaWatchlistDto } from '@alexeev/contracts';
import { useState } from 'react';
import { ApiError } from '../../../shared/api/http-client';
import {
  Banner,
  Button,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Icon,
  Menu,
  Panel,
  PanelList,
  PanelRow,
  Skeleton
} from '../../../shared/ui';
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

const WATCHLISTS_TITLE = 'Уведомлять, если в патче изменили';

/** The panel before its data exists and without a request, for the route skeleton. */
export function DotaWatchlistsSkeleton() {
  return (
    <Panel title={WATCHLISTS_TITLE} icon={<Icon name="list" />} reserveRows={2}>
      <div className={styles.loading} aria-busy="true">
        <Skeleton height={36} />
      </div>
    </Panel>
  );
}

/** Settings → Общие: who the owner is told about when a patch changes them. Adding happens in the patch breakdown. */
export function DotaWatchlists() {
  const query = useDotaWatchlists();
  const remove = useRemoveDotaWatchlist();
  const [confirming, setConfirming] = useState<DotaWatchlistDto | null>(null);
  const watches: DotaWatchlistDto[] = query.data?.watches ?? [];

  return (
    <Panel title={WATCHLISTS_TITLE} icon={<Icon name="list" />} {...(query.isPending ? { reserveRows: 2 } : {})}>
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
                    if (id === 'remove') setConfirming(watch);
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
      <ConfirmDialog
        isOpen={confirming !== null}
        onOpenChange={(open) => {
          if (!open) setConfirming(null);
        }}
        title={`Не отслеживать «${confirming?.entityName ?? ''}»?`}
        description="Уведомления об изменениях в патчах для него перестанут приходить. Снова включить можно из разбора патча."
        confirmLabel="Да, не отслеживать"
        cancelLabel="Нет"
        onConfirm={() => {
          if (confirming) remove.mutate(confirming.id);
          setConfirming(null);
        }}
      />
    </Panel>
  );
}
