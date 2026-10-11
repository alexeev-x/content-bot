import type { DotaSourceDto, DotaUpdateDto } from '@alexeev/contracts';
import { Link } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ApiError } from '../../../shared/api/http-client';
import {
  Button,
  ColumnFilter,
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

function when(value: string): string {
  const date = new Date(value);
  const elapsed = Date.now() - date.getTime();
  if (elapsed < 60 * 60_000) return `${Math.max(1, Math.floor(elapsed / 60_000))} мин назад`;
  if (elapsed < 24 * 60 * 60_000) return `${Math.floor(elapsed / (60 * 60_000))} ч назад`;
  return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
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
  search: string,
  type: UpdateType,
  onSearch: (value: string) => void,
  onType: (value: UpdateType) => void
): DataColumn<DotaUpdateDto>[] {
  return [
    {
      id: 'type',
      header: 'Тип',
      cell: (item) => `${TYPE_LABELS[item.type]}${item.isBaseline ? ' · при первом подключении' : ''}`,
      headerControl: (
        <ColumnFilter label="Фильтр по типу" isActive={type !== 'all'}>
          <RadioGroup label="Тип обновления" value={type} onChange={(value) => onType(value as UpdateType)}>
            <Radio value="all">Все</Radio>
            <Radio value="patch">Патч</Radio>
            <Radio value="news">Новость</Radio>
          </RadioGroup>
        </ColumnFilter>
      )
    },
    {
      id: 'title',
      header: 'Заголовок',
      isRowHeader: true,
      headerControl: (
        <ColumnFilter label="Поиск по заголовку" icon="search" isActive={search.trim() !== ''}>
          <SearchField label="Заголовок" placeholder="Что ищем?" value={search} onChange={onSearch} />
        </ColumnFilter>
      ),
      cell: (item) => (
        <span className={styles.title} title={item.title}>
          {item.title}
        </span>
      )
    },
    { id: 'source', header: 'Источник', cell: (item) => SOURCE_NAMES[item.sourceKey] },
    { id: 'time', header: 'Когда', compactSlot: 'trailing', cell: (item) => when(item.publishedAt) },
    {
      id: 'actions',
      header: 'Действия',
      align: 'end',
      cell: (item) => (
        <div className={styles.actions}>
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

function sourceColumns(): DataColumn<DotaSourceDto>[] {
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
            {source.lastSuccessAt
              ? `Успешно: ${when(source.lastSuccessAt)}`
              : source.health === 'stale'
                ? 'Успешная проверка была ранее; время неизвестно'
                : source.lastAttemptAt
                  ? `Попытка: ${when(source.lastAttemptAt)} · успеха ещё не было`
                  : 'Источник ещё не проверялся'}
          </span>
          {source.openIncident ? <span className={styles.muted}>Ошибка: {source.openIncident.code}</span> : null}
        </div>
      )
    },
    { id: 'status', header: 'Статус', compactSlot: 'trailing', cell: (source) => <SourceHealth source={source} /> }
  ];
}

export function DotaIntelligence() {
  const query = useQuery(dotaIntelligenceQueryOptions());
  const [view, setView] = useState<View>('updates');
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

  if (!query.data && query.isPending) {
    return (
      <Panel title="Загрузка Dota Pulse" reserveRows={8}>
        <DataTable
          aria-label="Загрузка обновлений Dota"
          columns={updateColumns(search, type, setSearch, setType)}
          rows={[]}
          getRowId={(item) => item.id}
          isLoading
          loadingRows={8}
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
                  columns={updateColumns(search, type, setSearch, setType)}
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
                columns={sourceColumns()}
                rows={query.data.sources}
                getRowId={(source) => source.key}
              />
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
