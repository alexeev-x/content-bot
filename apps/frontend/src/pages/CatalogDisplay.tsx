import { useState } from 'react';
import {
  Banner,
  Button,
  Card,
  DataTable,
  EmptyState,
  ErrorState,
  Icon,
  KpiTile,
  Panel,
  PanelList,
  PanelRow,
  SearchField,
  SegmentedControl,
  Select,
  Skeleton,
  Spinner,
  StatusBadge,
  TelegramPreview,
  Timeline,
  Toolbar,
  ToolbarGrow,
  type DataColumn,
  type RowSelection,
  type StatusKey,
  type TableSort
} from '../shared/ui';
import styles from './CatalogPage.module.css';

const STATUSES: readonly StatusKey[] = [
  'scheduled',
  'queued',
  'sending',
  'sent',
  'retry_wait',
  'failed',
  'unknown',
  'cancelled',
  'draft',
  'approved',
  'ok',
  'paused',
  'stale'
];
type Row = { id: string; title: string; status: StatusKey; at: string; channel: string };
const ROWS: readonly Row[] = [
  { id: 'p1', title: 'Герой дня: Invoker', status: 'scheduled', at: '07 окт, 10:00', channel: 'ALEXEEV — канал' },
  {
    id: 'p2',
    title: 'Мета недели: кто выигрывает на 7.39c',
    status: 'sent',
    at: '06 окт, 18:00',
    channel: 'ALEXEEV — канал'
  },
  {
    id: 'p3',
    title: 'Патч 7.39c: что изменилось для керри',
    status: 'unknown',
    at: '06 окт, 11:00',
    channel: 'Тестовый канал'
  }
];
const COLUMNS: readonly DataColumn<Row>[] = [
  { id: 'title', header: 'Title', isRowHeader: true, allowsSorting: true, cell: (row) => row.title },
  { id: 'status', header: 'Status', cell: (row) => <StatusBadge status={row.status} /> },
  { id: 'at', header: 'When', allowsSorting: true, cell: (row) => <span className="mono">{row.at}</span> },
  { id: 'channel', header: 'Channel', cell: (row) => row.channel }
];

export function CatalogDisplay() {
  const [sort, setSort] = useState<TableSort>({ column: 'at', direction: 'ascending' });
  const [selected, setSelected] = useState<RowSelection>(new Set(['p2']));
  const [banner, setBanner] = useState(true);
  const sorted = [...ROWS].sort((a, b) => {
    const key = sort.column === 'title' ? 'title' : 'at';
    return (a[key] < b[key] ? -1 : 1) * (sort.direction === 'ascending' ? 1 : -1);
  });

  return (
    <>
      <h3 className={styles.group}>Status badges</h3>
      <div className={styles.row}>
        {STATUSES.map((status) => (
          <StatusBadge key={status} status={status} />
        ))}
      </div>

      <h3 className={styles.group}>Banners</h3>
      <div className={styles.stack}>
        <Banner tone="info" title="Информация">
          Календарь показывает время в Europe/Chisinau.
        </Banner>
        <Banner
          tone="warning"
          title="Источник устарел"
          action={
            <Button size="sm" variant="secondary">
              Проверить источник
            </Button>
          }
        >
          Последний ответ получен 4 дня назад.
        </Banner>
        <Banner tone="error" title="Канал недоступен">
          Бот не имеет доступа к каналу.
        </Banner>
        {banner ? (
          <Banner tone="conflict" title="Конфликт версий" onDismiss={() => setBanner(false)}>
            Пост изменён в другой вкладке (ревизия 8).
          </Banner>
        ) : null}
      </div>

      <h3 className={styles.group}>KPI tiles</h3>
      <div className={styles.kpis}>
        <KpiTile
          label="Запланировано · 7 дн"
          icon="clock"
          value="12"
          hint="+3 к прошлой"
          trend={[3, 5, 4, 7, 6, 9, 12]}
          trendLabel="Рост за неделю"
        />
        <KpiTile
          label="Требует внимания"
          icon="alert"
          value="2"
          hint="1 неизвестно"
          trend={[0, 1, 0, 1, 2]}
          tone="warn"
        />
        <KpiTile
          label="Автоматизации"
          icon="zap"
          value="1"
          unit="/ 3 в порядке"
          hint="1 пауза, 1 устарел"
          trend={[3, 3, 2, 2, 1]}
          tone="bad"
        />
      </div>

      <h3 className={styles.group}>Card, empty, error, loading</h3>
      <div className={styles.stack}>
        <Card title="Card title" actions={<a href="#catalog">Все</a>}>
          <p>Card content on surface-1.</p>
        </Card>
        <Panel
          title="Посты"
          icon={<Icon name="file" size={16} />}
          note="Europe/Moscow"
          action={<a href="#catalog">Все</a>}
          reserveRows={3}
        >
          <EmptyState
            icon="file"
            title="Постов пока нет"
            description="Создайте первый черновик, чтобы запланировать публикацию."
            action={<Button icon="plus">Новый пост</Button>}
          />
        </Panel>
        <Panel title="Panel list" headingLevel={3}>
          <PanelList>
            <PanelRow>Row flush to the panel edges</PanelRow>
            <PanelRow>Rows split by 1px rules</PanelRow>
          </PanelList>
        </Panel>
        <Toolbar label="Filters">
          <ToolbarGrow>
            <SearchField label="Search" value="" onChange={() => undefined} />
          </ToolbarGrow>
          <Select
            label="Status"
            options={[
              { id: 'all', label: 'Все' },
              { id: 'sent', label: 'Отправлено' }
            ]}
            value="all"
            onChange={() => undefined}
          />
          <SegmentedControl
            label="View"
            options={[
              { id: 'list', label: 'Список' },
              { id: 'cal', label: 'Календарь' }
            ]}
            value="list"
            onChange={() => undefined}
          />
        </Toolbar>
        <ErrorState
          message="Сервер не ответил. Попробуйте ещё раз."
          requestId="req_8f3a2c1d"
          onRetry={() => undefined}
        />
        <output className={styles.row} aria-busy="true">
          <Spinner label="Загрузка списка" />
          <Skeleton width={160} height={20} />
          <Skeleton width={80} height={20} radius="var(--radius-pill)" />
        </output>
        <Skeleton lines={3} height={14} />
      </div>

      <h3 className={styles.group}>Timeline, Telegram preview</h3>
      <div className={styles.stack}>
        <Timeline
          aria-label="Attempts"
          items={[
            { id: 'a', title: 'Запланировано', time: '06 окт, 09:12', status: 'scheduled' },
            { id: 'b', title: 'Попытка 1', time: '07 окт, 10:00:02', status: 'failed', description: 'Telegram: 502.' },
            { id: 'c', title: 'Повтор', time: '07 окт, 10:05:11', status: 'retry_wait' },
            { id: 'd', title: 'Отправлено', time: '07 окт, 10:06:40', status: 'sent', description: 'Сообщение 4812' }
          ]}
        />
        <TelegramPreview
          title="Герой дня: Invoker"
          body={'Сегодня разбираем Invoker.\nКомбо, которое стоит выучить.'}
          meta="10:00"
        />
      </div>

      <h3 className={styles.group}>Data table (cards below 860 px)</h3>
      <div className={styles.stack}>
        <DataTable
          aria-label="Publications"
          columns={COLUMNS}
          rows={sorted}
          getRowId={(row) => row.id}
          sort={sort}
          onSortChange={setSort}
          selectionMode="multiple"
          selected={selected}
          onSelectionChange={setSelected}
          onRowAction={() => undefined}
        />
        <DataTable
          aria-label="Loading publications"
          columns={COLUMNS}
          rows={[]}
          getRowId={(row) => row.id}
          isLoading
          loadingRows={3}
        />
        <DataTable
          aria-label="No publications"
          columns={COLUMNS}
          rows={[]}
          getRowId={(row) => row.id}
          emptyState={<EmptyState title="Ничего не найдено" description="Сбросьте фильтры." />}
        />
      </div>
    </>
  );
}
