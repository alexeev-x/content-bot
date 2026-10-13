import type { DotaSourceDto, DotaUpdateDto, DotaWatchMatchDto } from '@alexeev/contracts';
import { Link } from '@tanstack/react-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ApiError } from '../../../shared/api/http-client';
import {
  Button,
  DataTable,
  EmptyState,
  ErrorState,
  Panel,
  Radio,
  RadioGroup,
  SearchField,
  StatusPill,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  type DataColumn
} from '../../../shared/ui';
import { dotaIntelligenceQueryOptions } from '../api/dota-queries';
import { useDotaWatchlists } from '../api/dota-watchlists-queries';
import { DotaWatchlists } from './DotaWatchlists';
import styles from './DotaIntelligence.module.css';

type View = 'updates' | 'sources';
type UpdateType = 'all' | 'news' | 'patch';

const SOURCE_NAMES: Record<DotaSourceDto['key'], string> = {
  steam_news: 'Dota 2 · Steam Community',
  patch_notes: 'Dota 2 · Patch notes'
};
const HEALTH_LABELS: Record<DotaSourceDto['health'], string> = {
  healthy: 'Доступен',
  stale: 'Устарел',
  unverified: 'Не проверен',
  degraded: 'Есть инцидент'
};
const TYPE_LABELS: Record<DotaUpdateDto['type'], string> = { news: 'Новость', patch: 'Патч' };

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

function SourceHealth({ source }: { source: DotaSourceDto }) {
  const presentation = {
    healthy: { group: 'done' as const, icon: 'check-circle' as const },
    stale: { group: 'unknown' as const, icon: 'alert' as const },
    unverified: { group: 'muted' as const, icon: 'help' as const },
    degraded: { group: 'failed' as const, icon: 'x-circle' as const }
  }[source.health];
  return <StatusPill label={HEALTH_LABELS[source.health]} {...presentation} />;
}

function updateColumns(
  timezone: string,
  onOpen: (element: HTMLAnchorElement) => void,
  matches: DotaWatchMatchDto[]
): DataColumn<DotaUpdateDto>[] {
  return [
    {
      id: 'type',
      header: 'Тип',
      cell: (item) => `${TYPE_LABELS[item.type]}${item.isBaseline ? ' · при первом подключении' : ''}`
    },
    {
      id: 'title',
      header: 'Заголовок',
      isRowHeader: true,
      cell: (item) => {
        const itemMatches = matches.filter(
          (match) => `${match.update.sourceKey}:${match.update.externalId}` === item.id
        );
        return (
          <div className={styles.titleCell}>
            <span className={styles.title} title={item.title}>
              {item.title}
            </span>
            {itemMatches.map((match) => {
              const status =
                match.alertStatus === 'unknown'
                  ? 'Требует проверки'
                  : match.alertStatus === 'sent'
                    ? 'Уведомление отправлено'
                    : match.alertStatus === 'failed'
                      ? 'Не удалось отправить'
                      : match.alertStatus === 'disabled'
                        ? 'Уведомления отключены'
                        : match.alertStatus === 'sending'
                          ? 'Отправляется'
                          : 'В очереди';
              return (
                <div className={styles.match} key={match.id}>
                  <span>Совпадение: {match.entityName}</span>
                  <span>{status}</span>
                  {match.alertStatus === 'unknown' ? (
                    <span>Уведомление могло дойти; повторная отправка не предлагается.</span>
                  ) : null}
                </div>
              );
            })}
          </div>
        );
      }
    },
    { id: 'source', header: 'Источник', cell: (item) => SOURCE_NAMES[item.sourceKey] },
    {
      id: 'time',
      header: 'Когда',
      compactSlot: 'trailing',
      cell: (item) => (
        <div className={styles.sourceDetails}>
          <time dateTime={item.publishedAt} title={`${fullTime(item.publishedAt, timezone)}, ${timezone}`}>
            Опубликовано: {fullTime(item.publishedAt, timezone)}, {timezone}
          </time>
          <span>
            Обнаружено:{' '}
            <time dateTime={item.detectedAt} title={`${fullTime(item.detectedAt, timezone)}, ${timezone}`}>
              {fullTime(item.detectedAt, timezone)}, {timezone}
            </time>
          </span>
        </div>
      )
    },
    {
      id: 'actions',
      header: 'Действия',
      align: 'end',
      cell: (item) => (
        <div className={styles.actions}>
          <Link
            className={styles.link}
            to="/sources"
            search={(previous) => ({ ...previous, update: item.id })}
            aria-label={`Открыть разбор: ${item.title}`}
            data-update-opener={item.id}
            onClick={(event) => onOpen(event.currentTarget)}
          >
            Открыть разбор
          </Link>
          <a className={styles.link} href={item.sourceUrl} target="_blank" rel="noreferrer">
            Источник
          </a>
          {item.linkedDraft ? (
            <Link className={styles.link} to="/posts/$id" params={{ id: item.linkedDraft.id }}>
              Черновик
            </Link>
          ) : null}
        </div>
      )
    }
  ];
}

function sourceColumns(timezone: string): DataColumn<DotaSourceDto>[] {
  return [
    { id: 'name', header: 'Источник', isRowHeader: true, cell: (source) => <strong>{source.name}</strong> },
    {
      id: 'domain',
      header: 'Адрес',
      cell: (source) => (
        <a className={`${styles.mono} ${styles.link}`} href={source.officialUrl} target="_blank" rel="noreferrer">
          {new URL(source.officialUrl).hostname}
        </a>
      )
    },
    {
      id: 'checked',
      header: 'Последняя проверка',
      cell: (source) => (
        <div className={styles.sourceDetails}>
          <span>
            Попытка:{' '}
            {source.lastAttemptAt ? (
              <time
                dateTime={source.lastAttemptAt}
                aria-label={`${fullTime(source.lastAttemptAt, timezone)}, ${timezone}`}
              >
                {fullTime(source.lastAttemptAt, timezone)}, {timezone}
              </time>
            ) : (
              'ещё не проверялся'
            )}
          </span>
          <span>
            Успех:{' '}
            {source.lastSuccessAt ? (
              <time
                dateTime={source.lastSuccessAt}
                aria-label={`${fullTime(source.lastSuccessAt, timezone)}, ${timezone}`}
              >
                {fullTime(source.lastSuccessAt, timezone)}, {timezone}
              </time>
            ) : (
              'успешных проверок пока нет'
            )}
          </span>
          {source.openIncident ? <span className={styles.muted}>Ошибка: {source.openIncident.code}</span> : null}
        </div>
      )
    },
    { id: 'status', header: 'Статус', compactSlot: 'trailing', cell: (source) => <SourceHealth source={source} /> }
  ];
}

type Props = { timezone?: string; update?: string };

export function DotaIntelligence({ timezone = 'Europe/Moscow', update }: Props) {
  const query = useQuery(dotaIntelligenceQueryOptions());
  const watchQuery = useDotaWatchlists();
  const [opener, setOpener] = useState<HTMLAnchorElement | null>(null);
  const previousWatchIds = useRef<Set<string> | null>(null);
  const [view, setView] = useState<View>('sources');
  const [search, setSearch] = useState('');
  const [type, setType] = useState<UpdateType>('all');
  const updates = useMemo(
    () =>
      (query.data?.updates ?? []).filter(
        (item) =>
          (type === 'all' || item.type === type) &&
          (!search.trim() || item.title.toLocaleLowerCase('ru').includes(search.trim().toLocaleLowerCase('ru')))
      ),
    [query.data?.updates, search, type]
  );

  useEffect(() => {
    if (!update && opener?.isConnected) {
      const frame = requestAnimationFrame(() => opener.focus());
      return () => cancelAnimationFrame(frame);
    }
  }, [opener, update]);

  useEffect(() => {
    if (!watchQuery.data) return;
    const previous = previousWatchIds.current;
    if (previous === null) {
      previousWatchIds.current = new Set(watchQuery.data.watches.map((watch) => watch.id));
      return;
    }
    if (update) return;
    const added = watchQuery.data.watches.find((watch) => !previous.has(watch.id));
    previousWatchIds.current = new Set(watchQuery.data.watches.map((watch) => watch.id));
    if (!added) return;
    const frame = requestAnimationFrame(() =>
      document.querySelector<HTMLElement>(`[data-watch-id="${CSS.escape(added.id)}"]`)?.focus()
    );
    return () => cancelAnimationFrame(frame);
  }, [watchQuery.data, update]);

  if (!query.data && query.isPending) {
    return (
      <Panel title="Загрузка официальных источников" reserveRows={2}>
        <DataTable
          aria-label="Загрузка официальных источников Dota 2"
          columns={sourceColumns(timezone)}
          rows={[]}
          getRowId={(source) => source.key}
          isLoading
          loadingRows={2}
        />
      </Panel>
    );
  }
  if (!query.data) {
    const status = query.error instanceof ApiError ? query.error.status : undefined;
    const forbidden = status === 403;
    const unauthorized = status === 401;
    const requestId = query.error instanceof ApiError ? query.error.requestId : undefined;
    return (
      <ErrorState
        title={forbidden ? 'Нет доступа' : unauthorized ? 'Сессия истекла' : undefined}
        message={
          forbidden
            ? 'Dota Intelligence доступен только владельцу.'
            : unauthorized
              ? 'Войдите снова, чтобы открыть источники и обновления.'
              : 'Не удалось загрузить официальные обновления Dota. Повторите безопасную загрузку.'
        }
        {...(requestId ? { requestId } : {})}
        {...(forbidden || unauthorized ? {} : { onRetry: () => void query.refetch() })}
        {...(unauthorized ? { action: <Link to="/login">Войти снова</Link> } : {})}
      />
    );
  }

  const refresh = (
    <Button
      size="sm"
      variant="secondary"
      icon="retry"
      isLoading={query.isFetching}
      onPress={() => void query.refetch()}
    >
      Обновить
    </Button>
  );
  return (
    <div className={styles.page}>
      <div className={styles.tabs}>
        <Tabs selectedKey={view} onSelectionChange={(key) => setView(key as View)}>
          <TabList aria-label="Раздел Dota Intelligence">
            <Tab id="updates">Обновления</Tab>
            <Tab id="sources">Источники</Tab>
          </TabList>
          <TabPanel id="updates">
            <div className={styles.filters}>
              <RadioGroup label="Тип обновления" value={type} onChange={(value) => setType(value as UpdateType)}>
                <Radio value="all">Все</Radio>
                <Radio value="patch">Патчи</Radio>
                <Radio value="news">Новости</Radio>
              </RadioGroup>
              <SearchField label="Поиск по заголовку" placeholder="Что ищем?" value={search} onChange={setSearch} />
            </div>
            <DotaWatchlists
              confirmedUpdateId={query.data.updates.find((item) => item.sourceKey === 'patch_notes')?.id}
            />
            <Panel
              title="Официальные обновления"
              marker={<span className={styles.muted}>Только подтверждённые записи лент</span>}
              action={refresh}
              footer={
                <span>
                  {updates.length === query.data.updates.length
                    ? `Показано ${updates.length} последних обновлений`
                    : `${updates.length} из ${query.data.updates.length}`}
                </span>
              }
            >
              {updates.length === 0 ? (
                <EmptyState
                  icon="check-circle"
                  title={
                    query.data.updates.length === 0
                      ? 'Новых официальных обновлений нет'
                      : 'Нет обновлений по этим фильтрам'
                  }
                  description={
                    query.data.updates.length === 0
                      ? 'Источники остаются доступны во вкладке «Источники».'
                      : 'Измените поиск или сбросьте фильтры.'
                  }
                  action={
                    query.data.updates.length > 0 ? (
                      <Button
                        variant="secondary"
                        onPress={() => {
                          setSearch('');
                          setType('all');
                        }}
                      >
                        Сбросить фильтры
                      </Button>
                    ) : undefined
                  }
                />
              ) : (
                <DataTable
                  flush
                  density="compact"
                  aria-label="Официальные обновления Dota 2"
                  columns={updateColumns(timezone, setOpener, watchQuery.data?.matches ?? [])}
                  rows={updates}
                  getRowId={(item) => item.id}
                />
              )}
            </Panel>
          </TabPanel>
          <TabPanel id="sources">
            <Panel title="Официальные источники" note={`${query.data.sources.length} источника`} action={refresh}>
              <DataTable
                flush
                density="compact"
                aria-label="Официальные источники Dota 2"
                columns={sourceColumns(timezone)}
                rows={query.data.sources}
                getRowId={(source) => source.key}
              />
              {query.data.updates.length === 0 ? (
                <EmptyState
                  icon="check-circle"
                  title="Пока не наблюдалось обновлений"
                  description="Обе настроенные официальные ленты остаются доступны выше."
                />
              ) : null}
            </Panel>
          </TabPanel>
        </Tabs>
      </div>
      {query.isRefetchError ? (
        <ErrorState
          title="Показаны сохранённые данные"
          message="Не удалось обновить список. Время последней успешной проверки источников сохранено отдельно."
          onRetry={() => void query.refetch()}
        />
      ) : null}
      {query.isFetching ? (
        <span className={styles.refreshing} aria-live="polite">
          Обновляем список…
        </span>
      ) : null}
    </div>
  );
}
