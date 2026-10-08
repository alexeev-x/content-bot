import { useState } from 'react';
import {
  Banner,
  Button,
  ColumnFilter,
  DataTable,
  Drawer,
  EmptyState,
  ErrorState,
  Menu,
  Panel,
  Radio,
  RadioGroup,
  SearchField,
  Tab,
  TabList,
  Tabs,
  type DataColumn,
  type IconName
} from '../../shared/ui';
import { DOTA_EVENTS, EVENT_LABEL, SOURCES, agoText, type DotaEvent, type Source } from './preview-data';
import { DemoChip, Pill, PreviewPage, Tag, usePreviewToast } from './preview-kit';
import { FooterLine, PhoneSkeletonRows } from './parts';
import { useNarrow, useProtoNavigate, useProtoSearch, useProtoSearchUpdate, useScreenPhase } from './proto-kit';
import kit from './Preview.module.css';

const TYPES = [
  { id: 'all', label: 'Все' },
  { id: 'patch', label: 'Патч' },
  { id: 'news', label: 'Новость' },
  { id: 'tournament', label: 'Турнир' }
];
const STATUS: Record<Source['status'], { label: string; group: 'done' | 'unknown' | 'failed'; icon: IconName }> = {
  up: { label: 'Доступен', group: 'done', icon: 'check-circle' },
  stale: { label: 'Устарел', group: 'unknown', icon: 'alert' },
  down: { label: 'Недоступен', group: 'failed', icon: 'x-circle' }
};
const sourceName = (id: string) => SOURCES.find((s) => s.id === id)?.name ?? '—';

function StatusPill({ source }: { source: Source }) {
  const meta = STATUS[source.status];
  return (
    <Pill group={meta.group} icon={meta.icon}>
      {meta.label}
    </Pill>
  );
}

export function SourcesScreen() {
  const narrow = useNarrow();
  const { phase, retry } = useScreenPhase();
  const search = useProtoSearch();
  const update = useProtoSearchUpdate();
  const go = useProtoNavigate();
  const preview = usePreviewToast();
  const [query, setQuery] = useState('');
  const [type, setType] = useState('all');
  const [source, setSource] = useState('all');
  const view = search.view === 'sources' ? 'sources' : 'events';
  const partial = search.state === 'partial';
  const unreachable = search.state === 'unreachable';

  const events = DOTA_EVENTS.filter(
    (event) =>
      (!partial || event.sourceId !== 's2') &&
      (type === 'all' || event.type === type) &&
      (source === 'all' || event.sourceId === source) &&
      (!query.trim() || event.title.toLowerCase().includes(query.trim().toLowerCase()))
  );
  const blank = phase === 'empty';
  const ready = phase === 'ready' && !blank;
  const active = SOURCES.find((s) => s.id === search.id);
  const reset = () => {
    setQuery('');
    setType('all');
    setSource('all');
  };

  const eventColumns: DataColumn<DotaEvent>[] = [
    {
      id: 'type',
      header: 'Тип',
      cell: (event) => <Tag>{EVENT_LABEL[event.type]}</Tag>,
      headerControl: (
        <ColumnFilter label="Фильтр по типу" isActive={type !== 'all'}>
          <RadioGroup label="Тип" value={type} onChange={setType}>
            {TYPES.map((o) => (
              <Radio key={o.id} value={o.id}>
                {o.label}
              </Radio>
            ))}
          </RadioGroup>
        </ColumnFilter>
      )
    },
    {
      id: 'title',
      header: 'Заголовок',
      isRowHeader: true,
      headerControl: (
        <ColumnFilter label="Поиск по заголовку" icon="search" isActive={query.trim() !== ''}>
          <SearchField label="Заголовок" placeholder="Что ищем?" value={query} onChange={setQuery} />
        </ColumnFilter>
      ),
      cell: (event) => (
        <span className={kit.clampTitle} title={event.title}>
          {event.title}
        </span>
      )
    },
    {
      id: 'source',
      header: 'Источник',
      headerControl: (
        <ColumnFilter label="Фильтр по источнику" isActive={source !== 'all'}>
          <RadioGroup label="Источник" value={source} onChange={setSource}>
            {[{ id: 'all', label: 'Все' }, ...SOURCES.map((s) => ({ id: s.id, label: s.name }))].map((o) => (
              <Radio key={o.id} value={o.id}>
                {o.label}
              </Radio>
            ))}
          </RadioGroup>
        </ColumnFilter>
      ),
      cell: (event) => sourceName(event.sourceId)
    },
    {
      id: 'time',
      header: 'Когда',
      compactSlot: 'trailing',
      cell: (event) => <span className={kit.nowrap}>{agoText(event.agoMin)}</span>
    },
    {
      id: 'actions',
      header: 'Действия',
      align: 'end',
      cell: (event) => (
        <Menu
          label={`Действия: ${event.title}`}
          items={[
            { id: 'open', label: 'Открыть источник', icon: 'external' },
            { id: 'draft', label: 'Создать черновик поста', icon: 'edit' }
          ]}
          onAction={(id) => (id === 'draft' ? go('posts/new') : preview())}
        />
      )
    }
  ];
  const sourceColumns: DataColumn<Source>[] = [
    { id: 'name', header: 'Источник', isRowHeader: true, cell: (s) => <strong>{s.name}</strong> },
    { id: 'domain', header: 'Адрес', cell: (s) => <span className={kit.mono}>{s.domain}</span> },
    { id: 'checked', header: 'Последняя проверка', cell: (s) => agoText(s.checkedAgo) },
    { id: 'change', header: 'Изменение', cell: (s) => s.change },
    { id: 'status', header: 'Статус', compactSlot: 'trailing', cell: (s) => <StatusPill source={s} /> }
  ];

  let body;
  if (phase === 'error') {
    body = (
      <ErrorState
        message="Не удалось загрузить события. Публикации не затронуты."
        requestId="req_52c1be09"
        onRetry={retry}
      />
    );
  } else if (view === 'sources') {
    body = (
      <DataTable
        flush
        density="compact"
        aria-label="Источники"
        columns={sourceColumns}
        rows={SOURCES}
        getRowId={(s) => s.id}
        activeId={search.id}
        onRowAction={(id) => update({ id }, false)}
        isLoading={phase === 'loading'}
        loadingRows={3}
      />
    );
  } else if (phase === 'loading') {
    body = narrow ? (
      <PhoneSkeletonRows label="Загрузка событий" count={8} />
    ) : (
      <DataTable
        flush
        aria-label="Загрузка событий"
        columns={eventColumns}
        rows={[]}
        getRowId={(e) => e.id}
        isLoading
        loadingRows={8}
      />
    );
  } else if (blank) {
    body = (
      <EmptyState
        icon="check-circle"
        title="Новых событий нет"
        description="Как только источники опубликуют новость или патч, она появится здесь."
      />
    );
  } else if (events.length === 0) {
    body = (
      <EmptyState
        icon="search"
        title="Ничего не найдено"
        description="Измените запрос или фильтры."
        action={
          <Button variant="secondary" onPress={reset}>
            Сбросить фильтры
          </Button>
        }
      />
    );
  } else {
    body = (
      <DataTable
        flush
        density="compact"
        aria-label="События"
        columns={eventColumns}
        rows={events}
        getRowId={(e) => e.id}
      />
    );
  }

  return (
    <PreviewPage title="Dota Pulse">
      {unreachable ? (
        <Banner tone="warning" title="Источник не отвечает 2 ч, показаны данные на 06:40">
          Источник «Patch notes» недоступен. Остальные источники работают.
        </Banner>
      ) : null}
      <Tabs
        selectedKey={view}
        onSelectionChange={(key) => update({ view: key === 'events' ? undefined : String(key), id: undefined })}
      >
        <TabList aria-label="Разделы">
          <Tab id="events">События</Tab>
          <Tab id="sources">Источники</Tab>
        </TabList>
      </Tabs>
      <Panel
        title={view === 'sources' ? 'Источники' : 'События'}
        marker={<DemoChip />}
        reserveRows={ready ? undefined : 8}
        action={
          !narrow && view === 'events' && ready && (query.trim() || type !== 'all' || source !== 'all') ? (
            <Button variant="ghost" size="sm" icon="x" onPress={reset}>
              Сбросить фильтры
            </Button>
          ) : undefined
        }
        footer={
          <FooterLine
            text={
              !ready
                ? phase === 'loading'
                  ? 'Загружаем…'
                  : ' '
                : view === 'sources'
                  ? 'Проверено 3 источника'
                  : partial
                    ? `События 2 из 3 источников · ${events.length}`
                    : unreachable
                      ? `${events.length} событий · данные на 06:40`
                      : `${events.length} из ${DOTA_EVENTS.length}`
            }
          />
        }
      >
        {body}
      </Panel>
      {partial && ready && view === 'events' ? (
        <output className={kit.muted}>Источник «Patch notes» не ответил: патчи временно не показаны.</output>
      ) : null}
      <Drawer
        variant={narrow ? 'bottom' : 'side'}
        isOpen={Boolean(active)}
        onOpenChange={(open) => !open && update({ id: undefined })}
        title={active?.name ?? ''}
        meta={active ? <StatusPill source={active} /> : undefined}
      >
        {active ? (
          <div className={kit.stack}>
            {active.status !== 'up' ? (
              <Banner
                tone="warning"
                title={active.status === 'down' ? 'Источник не отвечает 2 ч' : 'Источник давно не обновлялся'}
              >
                Показаны данные на 06:40.
              </Banner>
            ) : null}
            <dl className={kit.facts}>
              <div className={kit.fact}>
                <dt>Адрес</dt>
                <dd className={kit.mono}>{active.domain}</dd>
              </div>
              <div className={kit.fact}>
                <dt>Разрешённые домены</dt>
                <dd className={kit.mono}>{active.allowed.join(', ')}</dd>
              </div>
              <div className={kit.fact}>
                <dt>Получено с</dt>
                <dd>{active.domain}</dd>
              </div>
            </dl>
            <h3 className={kit.sectionTitle}>Последние проверки</h3>
            <ul className={kit.checks}>
              {Array.from({ length: 5 }, (_, index) => (
                <li key={index}>
                  <span>{agoText(active.checkedAgo + index * 30)}</span>
                  <Pill
                    group={active.status === 'down' && index < 4 ? 'failed' : 'done'}
                    icon={active.status === 'down' && index < 4 ? 'x-circle' : 'check'}
                  >
                    {active.status === 'down' && index < 4 ? 'Нет ответа' : 'Доступен'}
                  </Pill>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Drawer>
    </PreviewPage>
  );
}
