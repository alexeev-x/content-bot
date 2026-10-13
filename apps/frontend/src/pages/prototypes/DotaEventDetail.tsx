import { useEffect, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Banner, Button, Panel, Skeleton } from '../../shared/ui';
import { EVENT_LABEL, type DotaEvent } from './preview-data';
import type { DotaEventDetailFixture } from './dota-event-details';
import type { DotaWatch } from './DotaWatchlists';
import { BASE, type ProtoSearch } from './proto-kit';
import styles from './DotaEventDetail.module.css';

type Props = {
  detail: DotaEventDetailFixture | undefined;
  event: DotaEvent | undefined;
  loading: boolean;
  readError: boolean;
  backSearch: ProtoSearch;
  onRetry: () => void;
  onDraft: (path: string) => void;
  watches: DotaWatch[];
  onWatch: (watch: Pick<DotaWatch, 'id' | 'kind' | 'name'>) => void;
  pendingWatchId?: string;
  actionsDisabled?: boolean;
};

const STATUS_LABEL: Record<DotaEventDetailFixture['parseStatus'], string> = {
  complete: 'Разбор завершён',
  incomplete: 'Требует ручной проверки',
  no_recognized_facts: 'Подтверждённых фактов не найдено',
  unavailable: 'Разбор недоступен'
};

export function DotaEventDetail({
  detail,
  event,
  loading,
  readError,
  backSearch,
  onRetry,
  onDraft,
  watches,
  onWatch,
  pendingWatchId,
  actionsDisabled
}: Props) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [retryMessage, setRetryMessage] = useState(false);

  useEffect(() => {
    headingRef.current?.focus();
  }, [detail?.updateKey, loading, readError]);

  const title = event?.title ?? 'Разбор обновления';

  return (
    <div className={styles.detail}>
      <Link
        to={`${BASE}/sources` as never}
        search={{ ...backSearch, update: undefined } as never}
        className={styles.backLink}
      >
        ← К обновлениям
      </Link>
      <h2 ref={headingRef} className={styles.title} tabIndex={-1}>
        {title}
      </h2>
      <p className={styles.meta}>
        {detail && event ? (
          <>
            {EVENT_LABEL[event.type]} · Patch notes <span aria-hidden="true">·</span> опубликовано {detail.publishedAt}{' '}
            · обнаружено {detail.detectedAt}
          </>
        ) : (
          'Метаданные обновления недоступны в демо.'
        )}
      </p>
      <Panel title="Разбор обновления" marker={<span className={styles.demo}>демо</span>}>
        {loading ? (
          <section className={styles.loading} aria-busy="true" aria-label="Загружаем разбор обновления">
            <Skeleton width="35%" height={20} />
            <Skeleton width="92%" height={16} />
            <Skeleton width="74%" height={16} />
            <Skeleton width="86%" height={16} />
          </section>
        ) : readError ? (
          <div className={styles.state}>
            <h3 ref={headingRef} tabIndex={-1}>
              Не удалось загрузить разбор
            </h3>
            <p>Демо ошибки чтения. Источник и состояние черновика не изменены.</p>
            <Button variant="secondary" onPress={onRetry}>
              Повторить чтение
            </Button>
          </div>
        ) : !detail || !event ? (
          <div className={styles.state}>
            <h3 ref={headingRef} tabIndex={-1}>
              Обновление не найдено
            </h3>
            <p>Для этой ссылки нет демо-данных.</p>
          </div>
        ) : (
          <div className={styles.content}>
            <div className={styles.statusLine}>
              <span className={styles.status} data-status={detail.parseStatus}>
                {STATUS_LABEL[detail.parseStatus]}
              </span>
              <span className={styles.muted}>Результат правил разбора · только чтение</span>
            </div>

            {detail.parseStatus === 'incomplete' ? (
              <Banner tone="warning" title="Требует ручной проверки">
                Показаны только независимо подтверждённые факты. Нераспознанные фрагменты не интерпретируются.
              </Banner>
            ) : null}

            {detail.parseStatus === 'unavailable' ? (
              <div className={styles.state}>
                <h3 ref={headingRef} tabIndex={-1}>
                  Не удалось подготовить разбор
                </h3>
                <p>
                  Проверьте оригинал обновления. В демо безопасное повторное чтение не меняет сохранённое состояние.
                </p>
                <Button variant="secondary" onPress={() => setRetryMessage(true)}>
                  Повторить чтение
                </Button>
                {retryMessage ? <output>Демо: сохранённый результат по-прежнему недоступен.</output> : null}
              </div>
            ) : detail.parseStatus === 'no_recognized_facts' ? (
              <div className={styles.state}>
                <h3 ref={headingRef} tabIndex={-1}>
                  Подтверждённых изменений не найдено
                </h3>
                <p>Это не означает, что в обновлении нет изменений: правила разбора не подтвердили факты для показа.</p>
              </div>
            ) : (
              <>
                <p className={styles.caveat}>
                  Показаны только результаты, распознанные правилами разбора; это не полный список изменений.
                </p>
                <ol className={styles.facts} aria-label="Подтверждённые факты">
                  {detail.facts.map((fact) => (
                    <li className={styles.fact} key={fact.id}>
                      <h3>{fact.entityName}</h3>
                      <dl className={styles.fields}>
                        <div>
                          <dt>Сущность</dt>
                          <dd>{fact.entityType}</dd>
                        </div>
                        <div>
                          <dt>Раздел</dt>
                          <dd>{fact.section}</dd>
                        </div>
                        <div>
                          <dt>Изменение</dt>
                          <dd>{fact.change}</dd>
                        </div>
                        {fact.direction ? (
                          <div>
                            <dt>Направление</dt>
                            <dd>{fact.direction}</dd>
                          </div>
                        ) : null}
                        {fact.before && fact.after ? (
                          <div>
                            <dt>Было → стало</dt>
                            <dd>
                              {fact.before} → {fact.after}
                            </dd>
                          </div>
                        ) : null}
                      </dl>
                      {(detail.parseStatus === 'complete' || detail.parseStatus === 'incomplete') && fact.entityKind
                        ? (() => {
                            const kind = fact.entityKind === 'hero' ? 'Герой' : 'Предмет';
                            const actionKind = kind === 'Герой' ? 'героем' : 'предметом';
                            const watchId = `${kind}:${fact.entityName}`;
                            const alreadyWatching = watches.some((watch) => watch.id === watchId);
                            return alreadyWatching ? (
                              <Button
                                variant="secondary"
                                size="sm"
                                isDisabled
                                aria-label={`Уже отслеживается: ${fact.entityName}`}
                              >
                                Уже отслеживается
                              </Button>
                            ) : (
                              <Button
                                variant="secondary"
                                size="sm"
                                isDisabled={pendingWatchId === watchId || actionsDisabled}
                                onPress={() => onWatch({ id: watchId, kind, name: fact.entityName })}
                              >
                                {pendingWatchId === watchId
                                  ? 'Добавляем…'
                                  : `Следить за ${actionKind}: ${fact.entityName}`}
                              </Button>
                            );
                          })()
                        : null}
                    </li>
                  ))}
                </ol>
              </>
            )}

            <div className={styles.actions}>
              <a href={detail.sourceUrl} target="_blank" rel="noreferrer">
                Открыть официальный источник (новая вкладка)
              </a>
              {detail.linkedDraft ? (
                <Button variant="link" onPress={() => onDraft(detail.linkedDraft ?? '')}>
                  Открыть черновик
                </Button>
              ) : null}
            </div>
            {retryMessage && detail.parseStatus !== 'unavailable' ? (
              <output>Повторное чтение завершено: данные демо не изменились.</output>
            ) : null}
          </div>
        )}
      </Panel>
    </div>
  );
}
