import type { DotaWatchlistDto } from '@alexeev/contracts';
import { Link } from '@tanstack/react-router';
import { useRef } from 'react';
import { ApiError } from '../../../shared/api/http-client';
import { Button, EmptyState, Menu, Panel, PanelList, PanelRow } from '../../../shared/ui';
import { useDotaWatchlists, useRemoveDotaWatchlist } from '../api/dota-watchlists-queries';
import styles from './DotaWatchlists.module.css';

const kindLabel = { hero: 'Герой', item: 'Предмет' } as const;
function mutationError(error: unknown): string {
  if (error instanceof ApiError && error.status === 409)
    return 'Список изменился. Проверьте текущее состояние и повторите действие вручную.';
  if (error instanceof ApiError && error.status === 0)
    return 'Нет соединения. Изменение не поставлено в очередь; список сохранён.';
  if (error instanceof ApiError && error.requestId)
    return `Изменение не подтверждено сервером. Номер запроса: ${error.requestId}`;
  return 'Изменение не подтверждено сервером. Список сохранён.';
}

export function DotaWatchlists({ confirmedUpdateId }: { confirmedUpdateId?: string }) {
  const query = useDotaWatchlists();
  const remove = useRemoveDotaWatchlist();
  const panelRef = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<{ removedId: string; order: string[] } | null>(null);
  const watches = query.data?.watches ?? [];

  const removeWatch = (watch: DotaWatchlistDto) => {
    pendingFocus.current = { removedId: watch.id, order: watches.map((item) => item.id) };
    remove.mutate(watch.id, {
      onSuccess: () => {
        const order = pendingFocus.current?.order ?? [];
        const index = order.indexOf(watch.id);
        const nextId = order[index + 1] ?? order[index - 1];
        requestAnimationFrame(() => {
          if (nextId) document.querySelector<HTMLElement>(`[data-watch-id="${CSS.escape(nextId)}"]`)?.focus();
          else {
            const heading = panelRef.current?.querySelector<HTMLElement>('h2');
            heading?.setAttribute('tabindex', '-1');
            heading?.focus();
          }
        });
      }
    });
  };

  return (
    <div ref={panelRef}>
      <Panel
        title="Мои отслеживания"
        footer="Совпадения показываются только для подтверждённых фактов из сохранённых обновлений."
      >
        {!query.data && query.isPending ? <p aria-busy="true">Загружаем отслеживания…</p> : null}
        {!query.data && query.isError ? (
          <div role="alert" className={styles.message}>
            <p>
              Не удалось загрузить список отслеживаний
              {query.error instanceof ApiError && query.error.requestId
                ? `. Номер запроса: ${query.error.requestId}`
                : '.'}
            </p>
            <Button variant="secondary" onPress={() => void query.refetch()}>
              Повторить чтение
            </Button>
          </div>
        ) : null}
        {query.data && watches.length === 0 ? (
          <EmptyState
            icon="search"
            title="Вы пока ничего не отслеживаете"
            description="Откройте разбор подтверждённого факта героя или предмета и включите отслеживание."
            action={
              confirmedUpdateId ? (
                <Link to="/sources" search={(previous) => ({ ...previous, update: confirmedUpdateId })}>
                  Открыть подтверждённые факты
                </Link>
              ) : undefined
            }
          />
        ) : null}
        {query.data && watches.length > 0 ? (
          <PanelList aria-label="Отслеживаемые герои и предметы">
            {watches.map((watch) => (
              <PanelRow key={watch.id}>
                <div className={styles.row} data-watch-id={watch.id} tabIndex={-1}>
                  <div className={styles.identity}>
                    <strong>{watch.entityName}</strong>
                    <span>{kindLabel[watch.entityType]}</span>
                  </div>
                  <div className={styles.action}>
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
                        if (id === 'remove') removeWatch(watch);
                      }}
                    />
                  </div>
                </div>
              </PanelRow>
            ))}
          </PanelList>
        ) : null}
        {remove.isError ? (
          <div className={styles.message} role="alert">
            <p>{mutationError(remove.error)}</p>
            <Button variant="secondary" onPress={() => remove.reset()}>
              Понятно
            </Button>
          </div>
        ) : null}
      </Panel>
    </div>
  );
}
