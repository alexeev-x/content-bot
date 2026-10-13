import { useRef, useState } from 'react';
import { Banner, Button, EmptyState, Menu, Panel, Skeleton, StatusPill } from '../../shared/ui';
import { DemoChip } from './preview-kit';
import styles from './DotaWatchlists.module.css';

export type DotaWatch = {
  id: string;
  kind: 'Герой' | 'Предмет';
  name: string;
  match?: string;
  alert: 'unknown' | 'sent' | 'failed' | 'none';
};

type Props = {
  watches: DotaWatch[];
  onRemove: (id: string) => void;
  state?: string;
  onRetry: () => void;
  onShowFacts: () => void;
};

export function DotaWatchlists({ watches, onRemove, state, onRetry, onShowFacts }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [message, setMessage] = useState('');
  const [pendingId, setPendingId] = useState<string>();
  const failure = state === 'watch-error' || state === 'watch-conflict' || state === 'watch-offline';
  const list = state === 'watch-empty' ? [] : watches;

  const remove = (id: string) => {
    setPendingId(id);
    window.setTimeout(() => {
      onRemove(id);
      setPendingId(undefined);
      setMessage('Превью: отслеживание удалено только в демо-состоянии.');
      requestAnimationFrame(() => {
        if (watches.length > 1) {
          const next = document.querySelector<HTMLElement>(`[data-watch-row]:not([data-watch-row="${id}"])`);
          next?.focus();
        } else {
          const heading = panelRef.current?.querySelector<HTMLElement>('h2');
          heading?.setAttribute('tabindex', '-1');
          heading?.focus();
        }
      });
    }, 350);
  };

  return (
    <div ref={panelRef}>
      <Panel title="Мои отслеживания" marker={<DemoChip />}>
        <p className={styles.eligibilityNote}>Доступно только для подтверждённых фактов патча.</p>
        {state === 'watch-loading' ? (
          <div className={styles.loading} aria-busy="true" aria-label="Загружаем отслеживания">
            <Skeleton height={52} />
            <Skeleton height={52} />
          </div>
        ) : (
          <>
            {failure ? (
              <output className={styles.state} aria-live="polite">
                <Banner
                  tone="warning"
                  title={
                    state === 'watch-conflict'
                      ? 'Список изменился · 409'
                      : state === 'watch-offline'
                        ? 'Нет соединения'
                        : 'Не удалось изменить отслеживание'
                  }
                >
                  {state === 'watch-conflict'
                    ? 'Текущий список сохранён. Проверьте состояние и выберите действие ещё раз.'
                    : state === 'watch-offline'
                      ? 'Действие не поставлено в очередь и не выполнено.'
                      : 'Изменение не подтверждено. Список не менялся. req_watch_31a7'}
                </Banner>
                {state !== 'watch-offline' ? (
                  <Button variant="secondary" onPress={onRetry}>
                    Обновить список
                  </Button>
                ) : null}
              </output>
            ) : null}
            {list.length === 0 ? (
              <EmptyState
                icon="eye"
                action={
                  <Button variant="secondary" onPress={onShowFacts}>
                    Показать подтверждённый факт
                  </Button>
                }
                title="Вы пока ничего не отслеживаете"
                description="Добавить можно только подтверждённый факт в разборе обновления."
              />
            ) : (
              <>
                <ul className={styles.list} aria-label="Активные отслеживания">
                  {list.map((watch) => (
                    <li
                      className={styles.row}
                      key={watch.id}
                      data-watch-row={watch.id}
                      data-watch-name={watch.name}
                      tabIndex={-1}
                    >
                      <div className={styles.identity}>
                        <strong>{watch.name}</strong>
                        <span>{watch.kind} · Включено</span>
                        <span>{watch.match ? `Последнее совпадение: ${watch.match}` : 'Совпадений пока нет'}</span>
                      </div>
                      {watch.alert === 'unknown' ? (
                        <div className={styles.alert}>
                          <StatusPill label="Требует проверки" group="unknown" icon="alert" />
                          <p>
                            Telegram мог получить уведомление. Повторная отправка отключена, чтобы не создать дубль.
                          </p>
                        </div>
                      ) : watch.alert === 'sent' ? (
                        <StatusPill label="Уведомление отправлено" group="done" icon="check-circle" />
                      ) : watch.alert === 'failed' ? (
                        <StatusPill label="Уведомление не отправлено" group="failed" icon="x-circle" />
                      ) : null}
                      <Menu
                        label={`Действия: ${watch.name}`}
                        triggerSize="target"
                        items={[
                          {
                            id: 'remove',
                            label: `Не отслеживать: ${watch.name}`,
                            icon: 'x',
                            tone: 'danger',
                            isDisabled: pendingId === watch.id || state === 'watch-offline'
                          }
                        ]}
                        onAction={() => remove(watch.id)}
                      />
                      {pendingId === watch.id ? <output className={styles.pending}>Изменяем…</output> : null}
                    </li>
                  ))}
                </ul>
                {message ? (
                  <output className={styles.message} aria-live="polite">
                    {message}
                  </output>
                ) : null}
              </>
            )}
          </>
        )}
      </Panel>
    </div>
  );
}
