import { useEffect, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
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
  TabPanel,
  Tabs,
  type DataColumn,
  type IconName
} from '../../shared/ui';
import { DOTA_EVENTS, EVENT_LABEL, SOURCES, agoText, type DotaEvent, type Source } from './preview-data';
import { DemoChip, Pill, PreviewPage, Tag, usePreviewToast } from './preview-kit';
import { FooterLine, PhoneSkeletonRows } from './parts';
import { BASE, useNarrow, useProtoNavigate, useProtoSearch, useProtoSearchUpdate, useScreenPhase } from './proto-kit';
import { dotaDetailByEvent, dotaDetailByKey } from './dota-event-details';
import { DotaEventDetail } from './DotaEventDetail';
import { DotaWatchlists, type DotaWatch } from './DotaWatchlists';
import kit from './Preview.module.css';
import actionStyles from './SourcesScreen.module.css';

const TYPES = [
  { id: 'all', label: 'Все' },
  { id: 'patch', label: 'Патч' },
  { id: 'news', label: 'Новость' },
  { id: 'tournament', label: 'Турнир' }
];
type HeroPreview = { id: string; name: string; wins: number; picks: number; winRate: string; delta: string };
const HERO_PREVIEW: HeroPreview[] = [
  { id: 'axe', name: 'Axe', wins: 650, picks: 1240, winRate: '52,4%', delta: '+2,1 п.п.' },
  { id: 'lina', name: 'Lina', wins: 488, picks: 980, winRate: '49,8%', delta: '−1,4 п.п.' },
  { id: 'puck', name: 'Puck', wins: 369, picks: 720, winRate: '51,2%', delta: '+0,8 п.п.' }
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
  const [watches, setWatches] = useState<DotaWatch[]>([
    { id: 'Герой:Lina', kind: 'Герой', name: 'Lina', match: 'Патч 7.41', alert: 'unknown' }
  ]);
  const [pendingWatchId, setPendingWatchId] = useState<string>();
  const [watchMessage, setWatchMessage] = useState('');
  const view = search.view === 'sources' || search.view === 'heroes' ? search.view : 'events';
  const detail = dotaDetailByKey(search.update);
  const detailEvent = detail ? DOTA_EVENTS.find((event) => event.id === detail.eventId) : undefined;
  const openerRef = useRef<HTMLElement | null>(null);
  const openerIdRef = useRef<string | undefined>(undefined);
  const previousUpdateRef = useRef(search.update);
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
  const watchPanel = (
    <>
      <DotaWatchlists
        watches={watches}
        state={search.state?.startsWith('watch-') ? search.state : undefined}
        onRemove={(id) => setWatches((current) => current.filter((watch) => watch.id !== id))}
        onRetry={() => update({ state: undefined }, true)}
        onShowFacts={() => {
          const confirmedEvent = DOTA_EVENTS.find((event) => {
            const eventDetail = dotaDetailByEvent(event.id);
            return eventDetail?.parseStatus === 'complete' && eventDetail.facts.length > 0;
          });
          if (!confirmedEvent) return;
          const confirmedDetail = dotaDetailByEvent(confirmedEvent.id);
          if (confirmedDetail) go('sources', { update: confirmedDetail.updateKey });
        }}
      />
      {watchMessage ? (
        <output className={kit.muted} aria-live="polite">
          {watchMessage}
        </output>
      ) : null}
    </>
  );
  const addWatch = (watch: Pick<DotaWatch, 'id' | 'kind' | 'name'>) => {
    if (watches.some((item) => item.id === watch.id) || search.state === 'watch-offline') return;
    setPendingWatchId(watch.id);
    window.setTimeout(() => {
      setWatches((current) =>
        current.some((item) => item.id === watch.id) ? current : [...current, { ...watch, alert: 'none' }]
      );
      setPendingWatchId(undefined);
      setWatchMessage(`Превью: ${watch.name} добавлен только в демо-состоянии.`);
      requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-watch-row="${watch.id}"]`)?.focus());
    }, 350);
  };
  useEffect(() => {
    if (!search.update && previousUpdateRef.current) {
      requestAnimationFrame(() => {
        if (openerRef.current?.isConnected) {
          openerRef.current.focus();
          return;
        }
        const priorOpener = openerIdRef.current
          ? document.querySelector<HTMLElement>(`[data-update-opener="${openerIdRef.current}"]`)
          : null;
        (priorOpener ?? document.querySelector<HTMLElement>('[data-update-opener]'))?.focus();
      });
    }
    previousUpdateRef.current = search.update;
  }, [search.update]);

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
        <>
          {dotaDetailByEvent(event.id) ? (
            <Link
              to={`${BASE}/sources` as never}
              search={{ ...search, update: dotaDetailByEvent(event.id)?.updateKey } as never}
              className={actionStyles.detailLink}
              data-update-opener={event.id}
              aria-label={`Открыть разбор: ${event.title}`}
              onClick={(clickEvent) => {
                openerRef.current = clickEvent.currentTarget;
                openerIdRef.current = event.id;
              }}
              onFocus={(focusEvent) => focusEvent.stopPropagation()}
            >
              Открыть разбор
            </Link>
          ) : null}
          <Menu
            label={`Действия: ${event.title}`}
            items={[
              { id: 'open', label: 'Открыть источник', icon: 'external' },
              { id: 'draft', label: 'Создать черновик поста', icon: 'edit' }
            ]}
            onAction={(id) => (id === 'draft' ? go('posts/new') : preview())}
          />
        </>
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
  const heroColumns: DataColumn<HeroPreview>[] = [
    { id: 'name', header: 'Герой', isRowHeader: true, cell: (hero) => hero.name },
    { id: 'wins', header: 'Победы', align: 'end', cell: (hero) => hero.wins.toLocaleString('ru-RU') },
    { id: 'picks', header: 'Выборы', align: 'end', cell: (hero) => hero.picks.toLocaleString('ru-RU') },
    { id: 'winRate', header: 'Доля побед', align: 'end', cell: (hero) => hero.winRate },
    { id: 'delta', header: 'Изменение', align: 'end', cell: (hero) => hero.delta }
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
  } else if (view === 'heroes') {
    body = (
      <div className={kit.stack}>
        <Banner tone="info" title="Данные показаны как прототип">
          OpenDota · недавние матчи; источник стороннего сообщества, не официальная статистика Valve. Движение
          рассчитано между двумя сохранёнными наблюдениями.
        </Banner>
        <Panel title="Движение героев" note="Пример: ранг 1 · минимум 100 выборов в обеих выборках">
          <DataTable
            flush
            aria-label="Движение героев — демонстрационные данные"
            columns={heroColumns}
            rows={HERO_PREVIEW}
            getRowId={(hero) => hero.id}
          />
        </Panel>
      </div>
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
      {search.update ? (
        <>
          {watchPanel}
          <DotaEventDetail
            detail={detail}
            event={detailEvent}
            loading={phase === 'loading'}
            readError={search.state === 'detail-error'}
            backSearch={search}
            onRetry={() => update({ state: undefined }, true)}
            onDraft={(path) => go(path.replace('/__proto/', ''))}
            watches={watches}
            onWatch={addWatch}
            pendingWatchId={pendingWatchId}
            actionsDisabled={search.state === 'watch-offline'}
          />
        </>
      ) : (
        <>
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
              <Tab id="heroes">Герои</Tab>
            </TabList>
            <TabPanel id={view}>
              {view === 'events' ? (
                <div className={kit.stack}>
                  <Panel title="Фильтры обновлений" marker={<DemoChip />}>
                    <div className={kit.stack}>
                      <SearchField label="Заголовок" placeholder="Что ищем?" value={query} onChange={setQuery} />
                      <RadioGroup label="Тип обновления" value={type} onChange={setType}>
                        {TYPES.map((option) => (
                          <Radio key={option.id} value={option.id}>
                            {option.label}
                          </Radio>
                        ))}
                      </RadioGroup>
                      <RadioGroup label="Источник" value={source} onChange={setSource}>
                        {[
                          { id: 'all', label: 'Все' },
                          ...SOURCES.map((item) => ({ id: item.id, label: item.name }))
                        ].map((option) => (
                          <Radio key={option.id} value={option.id}>
                            {option.label}
                          </Radio>
                        ))}
                      </RadioGroup>
                    </div>
                  </Panel>
                  {watchPanel}
                </div>
              ) : null}
              <Panel
                title={view === 'sources' ? 'Источники' : view === 'heroes' ? 'Статистика героев' : 'События'}
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
                          : view === 'heroes'
                            ? 'Демо-данные · OpenDota, сообщественный источник'
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
            </TabPanel>
          </Tabs>
        </>
      )}
    </PreviewPage>
  );
}
