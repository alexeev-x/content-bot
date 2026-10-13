import type { DotaSourceKey } from '@alexeev/contracts';
import { Link } from '@tanstack/react-router';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useDocumentTitle } from '../../../app/use-document-title';
import { ApiError } from '../../../shared/api/http-client';
import { Banner, Button, Panel, Skeleton } from '../../../shared/ui';
import { dotaEventDetailQueryOptions } from '../api/dota-queries';
import { useAddDotaWatchlist, useDotaWatchlists } from '../api/dota-watchlists-queries';
import styles from './DotaEventDetail.module.css';

type Props = {
  sourceKey: DotaSourceKey;
  externalId: string;
  timezone: string;
};

const STATUS_LABEL = {
  not_applicable: 'Разбор не предусмотрен',
  pending: 'Разбор ещё не готов',
  complete: 'Разбор завершён',
  incomplete: 'Требует ручной проверки',
  no_recognized_facts: 'Подтверждённых фактов не найдено',
  unavailable: 'Разбор недоступен'
} as const;

const ENTITY_LABEL = {
  general: 'Общее',
  hero: 'Герой',
  item: 'Предмет',
  neutral_item: 'Нейтральный предмет',
  neutral_creep: 'Нейтральный крип'
} as const;

const SECTION_LABEL = {
  general: 'Общее',
  hero: 'Герои',
  ability: 'Способность',
  talent: 'Талант',
  item: 'Предметы',
  neutral_item: 'Нейтральные предметы',
  neutral_creep: 'Нейтральные крипы'
} as const;

function fullTime(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZoneName: 'short',
    timeZone: timezone
  }).format(new Date(iso));
}

export function DotaEventDetail({ sourceKey, externalId, timezone }: Props) {
  const navigate = useNavigate({ from: '/sources' });
  const query = useQuery(dotaEventDetailQueryOptions(sourceKey, externalId));
  const watchQuery = useDotaWatchlists();
  const addWatch = useAddDotaWatchlist();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const data = query.data;
  const forbidden = query.error instanceof ApiError && query.error.status === 403;
  const unauthorized = query.error instanceof ApiError && query.error.status === 401;
  const missing = query.error instanceof ApiError && query.error.status === 404;
  const requestId = query.error instanceof ApiError ? query.error.requestId : undefined;
  useDocumentTitle(data?.update.title ?? 'Разбор обновления');

  useEffect(() => {
    headingRef.current?.focus();
  }, [sourceKey, externalId, query.status]);

  const title = data?.update.title ?? 'Разбор обновления';
  const backLink = (
    <Link to="/sources" search={(previous) => ({ ...previous, update: undefined })} className={styles.backLink}>
      ← К обновлениям
    </Link>
  );

  return (
    <div className={styles.detail}>
      {backLink}
      <h2 ref={headingRef} className={styles.title} tabIndex={-1}>
        {title}
      </h2>
      {data ? (
        <p className={styles.meta}>
          {data.update.type === 'patch' ? 'Патч' : 'Новость'} ·{' '}
          {data.update.sourceKey === 'patch_notes' ? 'Patch notes' : 'Steam Community'}
          {' · опубликовано '}
          <time dateTime={data.update.publishedAt}>
            {fullTime(data.update.publishedAt, timezone)}, {timezone}
          </time>
          {' · обнаружено '}
          <time dateTime={data.update.detectedAt}>
            {fullTime(data.update.detectedAt, timezone)}, {timezone}
          </time>
        </p>
      ) : null}
      <Panel title="Разбор обновления">
        {query.isPending ? (
          <section className={styles.loading} aria-busy="true" aria-label="Загружаем разбор обновления">
            <Skeleton width="35%" height={20} />
            <Skeleton width="92%" height={16} />
            <Skeleton width="74%" height={16} />
            <Skeleton width="86%" height={16} />
          </section>
        ) : query.isError ? (
          <div className={styles.error} role="alert">
            <h3 tabIndex={-1} ref={headingRef}>
              {forbidden
                ? 'Нет доступа'
                : unauthorized
                  ? 'Сессия истекла'
                  : missing
                    ? 'Обновление не найдено'
                    : 'Не удалось загрузить разбор'}
            </h3>
            <p>
              {forbidden
                ? 'Доступ к этому обновлению не разрешён.'
                : unauthorized
                  ? 'Войдите снова, чтобы просмотреть разбор.'
                  : missing
                    ? 'Это обновление не найдено или больше недоступно.'
                    : 'Проверьте соединение и повторите безопасное чтение.'}
            </p>
            {requestId ? (
              <p>
                Номер запроса: <code>{requestId}</code>
              </p>
            ) : null}
            {unauthorized ? <Link to="/login">Войти снова</Link> : null}
            {!forbidden && !unauthorized && !missing ? (
              <Button variant="secondary" onPress={() => void query.refetch()}>
                Повторить чтение
              </Button>
            ) : null}
          </div>
        ) : data ? (
          <div className={styles.content}>
            <div className={styles.statusLine}>
              <span className={styles.status} data-status={data.parseStatus}>
                {STATUS_LABEL[data.parseStatus]}
              </span>
              <span className={styles.muted}>Только чтение · результат правил разбора</span>
            </div>
            {data.parseStatus === 'incomplete' ? (
              <Banner tone="warning" title="Требует ручной проверки">
                Показаны только независимо подтверждённые факты. Нераспознанные фрагменты не интерпретируются.
              </Banner>
            ) : null}
            {data.parseStatus === 'unavailable' ||
            data.parseStatus === 'pending' ||
            data.parseStatus === 'not_applicable' ? (
              <div className={styles.state}>
                <h3 ref={headingRef} tabIndex={-1}>
                  {data.parseStatus === 'unavailable'
                    ? 'Не удалось подготовить разбор'
                    : STATUS_LABEL[data.parseStatus]}
                </h3>
                <p>
                  {data.parseStatus === 'unavailable'
                    ? 'Проверьте оригинал обновления. Повторное чтение не запускает разбор и не меняет данные.'
                    : 'Сохранённый результат пока не содержит готовых данных для просмотра.'}
                </p>
                {data.parseStatus === 'unavailable' ? (
                  <Button variant="secondary" onPress={() => void query.refetch()}>
                    Повторить чтение
                  </Button>
                ) : null}
              </div>
            ) : data.parseStatus === 'no_recognized_facts' ? (
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
                {data.facts.length > 0 ? (
                  <ol className={styles.facts} aria-label="Подтверждённые факты">
                    {data.facts.map((fact) => (
                      <li className={styles.fact} key={fact.id}>
                        <h3>{fact.entityName}</h3>
                        {sourceKey === 'patch_notes' && (fact.entityType === 'hero' || fact.entityType === 'item') ? (
                          watchQuery.data?.watches.some(
                            (watch) =>
                              watch.entityType === fact.entityType &&
                              watch.entityName.toLocaleLowerCase('en-US') === fact.entityName.toLocaleLowerCase('en-US')
                          ) ? (
                            <output>Уже отслеживается</output>
                          ) : (
                            <div className={styles.watchAction}>
                              <Button
                                variant="secondary"
                                isLoading={addWatch.isPending && addWatch.variables?.factId === fact.id}
                                isDisabled={
                                  (addWatch.isPending && addWatch.variables?.factId === fact.id) || !navigator.onLine
                                }
                                onPress={() =>
                                  addWatch.mutate(
                                    { sourceKey: 'patch_notes', externalId, factId: fact.id },
                                    {
                                      onSuccess: () =>
                                        void navigate({ search: (previous) => ({ ...previous, update: undefined }) })
                                    }
                                  )
                                }
                              >
                                Следить за {fact.entityType === 'hero' ? 'героем' : 'предметом'}: {fact.entityName}
                              </Button>
                              {!navigator.onLine ? <span>Нет соединения. Изменения не ставятся в очередь.</span> : null}
                            </div>
                          )
                        ) : null}
                        <dl className={styles.fields}>
                          <div>
                            <dt>Сущность</dt>
                            <dd>{ENTITY_LABEL[fact.entityType]}</dd>
                          </div>
                          <div>
                            <dt>Раздел</dt>
                            <dd>{SECTION_LABEL[fact.section]}</dd>
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
                          {fact.before !== undefined && fact.after !== undefined ? (
                            <div>
                              <dt>Было → стало</dt>
                              <dd>
                                {fact.before} → {fact.after}
                              </dd>
                            </div>
                          ) : null}
                        </dl>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className={styles.caveat}>
                    Подтверждённых фактов пока нет. Это не означает, что в обновлении нет изменений.
                  </p>
                )}
                {addWatch.isError ? (
                  <div role="alert" className={styles.watchError}>
                    {addWatch.error instanceof ApiError && addWatch.error.status === 409
                      ? 'Список отслеживания изменился. Состояние обновлено; повторите действие вручную.'
                      : addWatch.error instanceof ApiError && addWatch.error.status === 0
                        ? 'Нет соединения. Запрос не поставлен в очередь, отслеживание не добавлено.'
                        : `Добавление не подтверждено сервером.${addWatch.error instanceof ApiError && addWatch.error.requestId ? ` Номер запроса: ${addWatch.error.requestId}` : ''}`}
                    <Button variant="secondary" onPress={() => addWatch.reset()}>
                      Понятно
                    </Button>
                  </div>
                ) : null}
              </>
            )}
            <div className={styles.actions}>
              <a href={data.update.sourceUrl} target="_blank" rel="noreferrer">
                Открыть официальный источник (новая вкладка)
              </a>
              {data.update.linkedDraft ? (
                <Link to="/posts/$id" params={{ id: data.update.linkedDraft.id }}>
                  Открыть черновик
                </Link>
              ) : null}
            </div>
          </div>
        ) : null}
      </Panel>
    </div>
  );
}
