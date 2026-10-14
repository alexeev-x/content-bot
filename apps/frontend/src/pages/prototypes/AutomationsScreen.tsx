import { useState } from 'react';
import {
  Banner,
  Button,
  ConfirmDialog,
  DataTable,
  Drawer,
  EmptyState,
  ErrorState,
  Icon,
  Panel,
  RowCard,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  useToast,
  type DataColumn
} from '../../shared/ui';
import { DemoChip, Pill, PreviewPage } from './preview-kit';
import { FooterLine, PhoneSkeletonRows } from './parts';
import { useNarrow, useProtoSearch, useProtoSearchUpdate, useScreenPhase } from './proto-kit';
import styles from './Automations.module.css';
import kit from './Preview.module.css';

type AutomationState = 'active' | 'paused' | 'running' | 'queued' | 'failed' | 'unknown' | 'partial' | 'stale';
type Automation = {
  id: string;
  name: string;
  purpose: string;
  cadence: string;
  nextRun: string;
  source: string;
  output: string;
  effects: string[];
  state: AutomationState;
  runId: string;
  lastRun: string;
  result: string;
  duration: string;
  inFlight?: boolean;
};

const FIXTURES: Automation[] = [
  {
    id: 'dota-updates-watchlists',
    name: 'Источники Dota и проверка watchlist',
    purpose: 'Опрос официальных источников Dota, разбор обновлений и проверка совпадений с наблюдениями',
    cadence: 'Каждые 5 минут · UTC',
    nextRun: '13 окт., 17:20 (Europe/Chisinau, UTC+3)',
    source: 'Официальные Dota-источники · сохранённые события и watchlist',
    output: 'Факты, черновик на проверку, личные уведомления',
    effects: [
      'Сохраняет проверенные факты и обновления источников.',
      'Новый патч может создать черновик на проверку владельцу и личное уведомление.',
      'Совпадение watchlist может создать дедуплицированное личное уведомление владельцу.'
    ],
    state: 'running',
    inFlight: true,
    runId: 'run_dota_20261013_1715',
    lastRun: '13 окт., 17:15 (Europe/Chisinau, UTC+3)',
    result: 'Выполняется · этот запуск продолжится',
    duration: '—'
  },
  {
    id: 'dota-hero-statistics',
    name: 'Обновление статистики героев',
    purpose: 'Сохраняет ограниченный снимок статистики героев из подключённого источника сообщества',
    cadence: 'Каждые 6 часов · :15 UTC',
    nextRun: '13 окт., 18:15 (Europe/Chisinau, UTC+3)',
    source: 'OpenDota · статистика героев',
    output: 'Ограниченный снимок с временем получения и свежестью',
    effects: [
      'Запрашивает ограниченную статистику героев.',
      'Сохраняет снимок; не создаёт публикацию и не отправляет сообщения.'
    ],
    state: 'active',
    runId: 'run_hero_stats_20261013_1215',
    lastRun: '13 окт., 12:15 (Europe/Chisinau, UTC+3)',
    result: 'Успешно · 126 героев в снимке',
    duration: '2,8 с'
  }
];

type Run = { id: string; automationId: string; time: string; status: string; duration: string; message: string };
const RUNS: Run[] = [
  {
    id: 'run_dota_20261013_1715',
    automationId: 'dota-updates-watchlists',
    time: '13 окт., 17:15',
    status: 'Выполняется',
    duration: '—',
    message: 'Текущий запуск продолжится после паузы автоматизации.'
  },
  {
    id: 'run_dota_20261013_1710',
    automationId: 'dota-updates-watchlists',
    time: '13 окт., 17:10',
    status: 'Успешно',
    duration: '4,1 с',
    message: 'Источники проверены; совпадений watchlist нет.'
  },
  {
    id: 'run_dota_20261013_1705',
    automationId: 'dota-updates-watchlists',
    time: '13 окт., 17:05',
    status: 'Частично',
    duration: '5,0 с',
    message: 'Один источник недоступен; остальные проверены.'
  },
  {
    id: 'run_hero_stats_20261013_1215',
    automationId: 'dota-hero-statistics',
    time: '13 окт., 12:15',
    status: 'Успешно',
    duration: '2,8 с',
    message: 'Снимок сохранён; источник OpenDota, 126 героев.'
  },
  {
    id: 'run_hero_stats_20261013_0615',
    automationId: 'dota-hero-statistics',
    time: '13 окт., 06:15',
    status: 'Ошибка',
    duration: '8,0 с',
    message: 'Источник временно недоступен; предыдущий снимок сохранён.'
  },
  {
    id: 'run_hero_stats_unknown',
    automationId: 'dota-hero-statistics',
    time: '12 окт., 18:15',
    status: 'Требует проверки',
    duration: '—',
    message: 'Результат неизвестен. Не повторяйте запуск автоматически: возможен дубль.'
  }
];

const STATUS: Record<
  AutomationState,
  {
    label: string;
    group: 'done' | 'muted' | 'failed' | 'unknown';
    icon: 'check-circle' | 'pause' | 'loader' | 'clock' | 'x-circle' | 'help' | 'alert';
  }
> = {
  active: { label: 'Активна', group: 'done', icon: 'check-circle' },
  paused: { label: 'Приостановлена', group: 'muted', icon: 'pause' },
  running: { label: 'Выполняется', group: 'unknown', icon: 'loader' },
  queued: { label: 'В очереди', group: 'unknown', icon: 'clock' },
  failed: { label: 'Ошибка', group: 'failed', icon: 'x-circle' },
  unknown: { label: 'Результат неизвестен', group: 'unknown', icon: 'help' },
  partial: { label: 'Частично', group: 'unknown', icon: 'alert' },
  stale: { label: 'Данные устарели', group: 'unknown', icon: 'alert' }
};
const statusPill = (state: AutomationState) => {
  const view = STATUS[state];
  return (
    <Pill group={view.group} icon={view.icon}>
      {view.label}
    </Pill>
  );
};

export function AutomationsScreen() {
  const narrow = useNarrow();
  const { phase, retry } = useScreenPhase();
  const search = useProtoSearch();
  const update = useProtoSearchUpdate();
  const toast = useToast();
  const [automations, setAutomations] = useState(FIXTURES);
  const [pausedTarget, setPausedTarget] = useState<Automation | null>(null);
  const [runTarget, setRunTarget] = useState<Automation | null>(null);
  const [pending, setPending] = useState(false);
  const [activeView, setActiveView] = useState<'automations' | 'runs'>(search.view === 'runs' ? 'runs' : 'automations');
  const [inspectorTab, setInspectorTab] = useState<'overview' | 'runs'>(search.tab === 'runs' ? 'runs' : 'overview');
  const demoOverride = ['partial', 'stale', 'unknown', 'queued', 'failed'].includes(search.update ?? '')
    ? (search.update as AutomationState)
    : null;
  const displayAutomations = automations.map((item) =>
    item.id === search.id && demoOverride ? { ...item, state: demoOverride } : item
  );
  const selected = displayAutomations.find((item) => item.id === search.id) ?? null;
  const selectedRuns = RUNS.filter((run) => run.automationId === selected?.id);
  const loading = phase === 'loading';
  const failed = phase === 'error';
  const empty = phase === 'empty';

  const open = (id: string) => {
    setInspectorTab('overview');
    update({ id, tab: undefined }, false);
  };
  const close = () => update({ id: undefined, tab: undefined });
  const pause = (item: Automation) => {
    setPausedTarget(item);
  };
  const confirmPause = () => {
    if (!pausedTarget) return;
    setPending(true);
    const target = pausedTarget;
    setPausedTarget(null);
    window.setTimeout(() => {
      setAutomations((items) =>
        items.map((item) => (item.id === target.id ? { ...item, state: 'paused', nextRun: '—' } : item))
      );
      setPending(false);
      toast.show({
        title: `Превью: «${target.name}» приостановлена`,
        description:
          'Новые запуски остановлены; текущий запуск продолжается. Публикации по расписанию продолжают отправляться.',
        tone: 'info'
      });
    }, 350);
  };
  const resume = (item: Automation) => {
    setPending(true);
    window.setTimeout(() => {
      setAutomations((items) =>
        items.map((entry) =>
          entry.id === item.id
            ? {
                ...entry,
                state: 'active',
                nextRun:
                  item.id === 'dota-hero-statistics'
                    ? '13 окт., 18:15 (Europe/Chisinau, UTC+3)'
                    : '13 окт., 17:20 (Europe/Chisinau, UTC+3)'
              }
            : entry
        )
      );
      setPending(false);
      toast.show({
        title: `Превью: «${item.name}» возобновлена`,
        description: 'Это локальная имитация; серверное расписание не изменено.',
        tone: 'success'
      });
    }, 350);
  };
  const requestRun = (item: Automation) => {
    if (item.state === 'queued' || item.state === 'running' || item.inFlight) {
      toast.show({
        title: 'Этот запуск уже поставлен в очередь',
        description: `Открыт существующий запуск ${item.runId}; дубль не создаётся.`,
        tone: 'info'
      });
      return;
    }
    if (item.state === 'paused' || item.state === 'unknown') return;
    setRunTarget(item);
  };
  const confirmRun = () => {
    if (!runTarget) return;
    const target = runTarget;
    setRunTarget(null);
    setAutomations((items) =>
      items.map((item) =>
        item.id === target.id
          ? {
              ...item,
              state: 'queued',
              result: 'Поставлен в очередь · выполнение не подтверждено',
              runId: `run_demo_${target.id}`
            }
          : item
      )
    );
    toast.show({
      title: 'Превью: запуск поставлен в очередь',
      description: `ID ${target.id}; используется имитация, реальная задача не запускалась.`,
      tone: 'success'
    });
  };

  const columns: DataColumn<Automation>[] = [
    {
      id: 'name',
      header: 'Автоматизация',
      isRowHeader: true,
      cell: (item) => (
        <span className={kit.cellTitle}>
          <strong>{item.name}</strong>
          <span className={kit.sub}>{item.purpose}</span>
        </span>
      )
    },
    {
      id: 'output',
      header: 'Источник · результат',
      cell: (item) => (
        <span className={kit.cellTitle}>
          <strong>{item.output}</strong>
          <span className={kit.sub}>{item.source}</span>
        </span>
      )
    },
    {
      id: 'cadence',
      header: 'Расписание',
      cell: (item) => (
        <span className={kit.cellTitle}>
          <strong>{item.cadence}</strong>
          <span className={kit.sub}>Следующий запуск: {item.state === 'paused' ? '—' : item.nextRun}</span>
        </span>
      )
    },
    {
      id: 'last',
      header: 'Последний запуск',
      cell: (item) => (
        <span className={kit.cellTitle}>
          <strong>{item.result}</strong>
          <span className={kit.sub}>
            {item.lastRun} · {item.duration}
          </span>
        </span>
      )
    },
    { id: 'state', header: 'Состояние', cell: (item) => statusPill(item.state) },
    {
      id: 'action',
      header: 'Действие',
      align: 'end',
      cell: (item) =>
        item.state === 'paused' ? (
          <Button variant="secondary" size="sm" onPress={() => resume(item)} isDisabled={pending}>
            Возобновить
          </Button>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            onPress={() => pause(item)}
            isDisabled={pending || item.state === 'unknown'}
          >
            Приостановить
          </Button>
        )
    }
  ];
  const runColumns: DataColumn<Run>[] = [
    {
      id: 'id',
      header: 'Запуск',
      isRowHeader: true,
      cell: (run) => (
        <span className={kit.cellTitle}>
          <strong>{automations.find((item) => item.id === run.automationId)?.name}</strong>
          <code className={kit.mono}>{run.id}</code>
        </span>
      )
    },
    { id: 'time', header: 'Время', cell: (run) => run.time },
    { id: 'status', header: 'Результат', cell: (run) => run.status },
    { id: 'duration', header: 'Длительность', cell: (run) => run.duration },
    { id: 'message', header: 'Сообщение', cell: (run) => run.message }
  ];

  const rows = activeView === 'runs' ? RUNS : automations;
  let content;
  if (failed) {
    content = (
      <ErrorState
        message="Не удалось загрузить автоматизации. Демо-данные не изменены."
        requestId="demo_automation_read_1"
        onRetry={retry}
      />
    );
  } else if (loading) {
    content = narrow ? (
      <PhoneSkeletonRows label="Загрузка автоматизаций" count={2} />
    ) : (
      <DataTable
        aria-label="Загрузка автоматизаций"
        columns={columns}
        rows={[]}
        getRowId={(item) => item.id}
        isLoading
        loadingRows={2}
      />
    );
  } else if (empty) {
    content = (
      <EmptyState
        icon="zap"
        title="Поддерживаемых автоматизаций пока нет"
        description="В превью нет сценария создания или настройки автоматизаций."
      />
    );
  } else if (activeView === 'runs') {
    content = (
      <DataTable
        aria-label="История запусков, демо-данные"
        columns={runColumns}
        rows={rows as Run[]}
        getRowId={(run) => run.id}
        onRowAction={(id) => {
          const run = RUNS.find((entry) => entry.id === id);
          if (run) open(run.automationId);
        }}
      />
    );
  } else if (narrow) {
    content = (
      <div className={kit.stack}>
        {displayAutomations.map((item) => (
          <RowCard
            key={item.id}
            title={item.name}
            status={statusPill(item.state)}
            meta={`${item.cadence} · Следующий запуск: ${item.state === 'paused' ? '—' : item.nextRun}`}
            warning={
              item.state === 'partial' || item.state === 'stale'
                ? 'Часть данных может быть неполной или устаревшей.'
                : undefined
            }
            onPress={() => open(item.id)}
            menu={
              <Button
                variant="secondary"
                onPress={() => (item.state === 'paused' ? resume(item) : pause(item))}
                isDisabled={pending}
              >
                {item.state === 'paused' ? 'Возобновить' : 'Приостановить'}
              </Button>
            }
          />
        ))}
      </div>
    );
  } else {
    content = (
      <DataTable
        aria-label="Поддерживаемые автоматизации, демо-данные"
        columns={columns}
        rows={displayAutomations}
        getRowId={(item) => item.id}
        onRowAction={open}
      />
    );
  }

  return (
    <PreviewPage title="Автоматизации — ALEXEEV Studio">
      <div className={styles.boundary} role="note">
        <Icon name="info" size={18} />
        <p>
          <strong>Граница публикаций.</strong> Уже запланированные публикации продолжат отправляться по расписанию
          независимо от паузы автоматизаций. Управление публикациями — в разделах «Публикации» и «Календарь».
        </p>
      </div>
      <div className={`${kit.kpis} ${styles.kpiGrid}`}>
        <div className={kit.kpiBox}>
          <div>
            <span className={`${kit.sub} ${styles.kpiLabel}`}>Поддерживаемые автоматизации</span>
            <strong className={styles.kpiValue}>{automations.length}</strong>
          </div>
          <DemoChip />
        </div>
        <div className={kit.kpiBox}>
          <div>
            <span className={`${kit.sub} ${styles.kpiLabel}`}>Включены</span>
            <strong className={styles.kpiValue}>{automations.filter((item) => item.state !== 'paused').length}</strong>
          </div>
          <DemoChip />
        </div>
        <div className={kit.kpiBox}>
          <div>
            <span className={`${kit.sub} ${styles.kpiLabel}`}>Выполняется сейчас</span>
            <strong className={styles.kpiValue}>{automations.filter((item) => item.state === 'running').length}</strong>
          </div>
          <DemoChip />
        </div>
      </div>
      <Tabs
        selectedKey={activeView}
        onSelectionChange={(key) => {
          const value = String(key) as 'automations' | 'runs';
          setActiveView(value);
          update({ view: value === 'automations' ? undefined : 'runs', id: undefined });
        }}
      >
        <TabList aria-label="Разделы Центра автоматизаций">
          <Tab id="automations">Автоматизации</Tab>
          <Tab id="runs">Запуски</Tab>
        </TabList>
        <TabPanel id={activeView}>
          <Panel
            title={activeView === 'runs' ? 'История запусков' : 'Зарегистрированные задачи'}
            marker={<DemoChip />}
            reserveRows={loading ? (narrow ? 2 : 3) : undefined}
            footer={
              <FooterLine
                text={
                  loading
                    ? 'Загружаем демо…'
                    : `${rows.length} ${activeView === 'runs' ? 'запусков' : 'автоматизации'} · демо`
                }
              />
            }
          >
            {content}
          </Panel>
        </TabPanel>
      </Tabs>

      {selected ? (
        <Drawer
          variant={narrow ? 'bottom' : 'side'}
          isOpen
          onOpenChange={(isDrawerOpen) => !isDrawerOpen && close()}
          title={selected.name}
          meta={statusPill(selected.state)}
          footer={
            <div className={styles.drawerActions}>
              <Button
                variant="secondary"
                icon="zap"
                isDisabled={selected.state === 'paused' || selected.state === 'unknown'}
                onPress={() => requestRun(selected)}
              >
                Запустить сейчас
              </Button>
              {selected.state === 'paused' ? (
                <Button variant="secondary" onPress={() => resume(selected)} isDisabled={pending}>
                  Возобновить
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  onPress={() => pause(selected)}
                  isDisabled={pending || selected.state === 'unknown'}
                >
                  Приостановить
                </Button>
              )}
            </div>
          }
        >
          <div className={kit.stack}>
            {selected.state === 'running' || selected.state === 'queued' || selected.inFlight ? (
              <Banner
                tone="info"
                title={selected.state === 'queued' ? 'Запуск уже поставлен в очередь' : 'Текущий запуск продолжится'}
              >
                Повторный запуск объединяется с {selected.runId}; второй запуск не создаётся.
              </Banner>
            ) : null}
            {selected.state === 'unknown' ? (
              <Banner tone="warning" title="Результат требует проверки">
                Не запускайте повторно: сначала проверьте существующий запуск {selected.runId}.
              </Banner>
            ) : null}
            {selected.state === 'partial' || selected.state === 'stale' ? (
              <Banner tone="warning" title="Данные неполные или устарели">
                Доступен только безопасный просмотр; повторный запуск не предлагается для неизвестного результата.
              </Banner>
            ) : null}
            <Tabs
              selectedKey={inspectorTab}
              onSelectionChange={(key) => setInspectorTab(String(key) as 'overview' | 'runs')}
            >
              <TabList aria-label="Разделы автоматизации">
                <Tab id="overview">Обзор</Tab>
                <Tab id="runs">Запуски</Tab>
              </TabList>
              <TabPanel id={inspectorTab}>
                {inspectorTab === 'overview' ? (
                  <div className={kit.stack}>
                    <p>{selected.purpose}</p>
                    <dl className={kit.facts}>
                      <div className={kit.fact}>
                        <dt>Источник</dt>
                        <dd>{selected.source}</dd>
                      </div>
                      <div className={kit.fact}>
                        <dt>Результат</dt>
                        <dd>{selected.output}</dd>
                      </div>
                      <div className={kit.fact}>
                        <dt>Расписание</dt>
                        <dd>{selected.cadence}</dd>
                      </div>
                      <div className={kit.fact}>
                        <dt>Следующий запуск</dt>
                        <dd>
                          {selected.state === 'paused' ? 'Не запланирован: автоматизация на паузе' : selected.nextRun}
                        </dd>
                      </div>
                      <div className={kit.fact}>
                        <dt>Последний запуск</dt>
                        <dd>
                          {selected.lastRun} · {selected.result} · {selected.duration}
                        </dd>
                      </div>
                    </dl>
                    <section className={kit.stack}>
                      <h3 className={kit.sectionTitle}>Возможные эффекты</h3>
                      <ul className={styles.effects}>
                        {selected.effects.map((effect) => (
                          <li key={effect}>{effect}</li>
                        ))}
                      </ul>
                      <p className={kit.muted}>
                        Эти локальные демо-данные не подтверждают реальные результаты; запуск не отправляет публикации.
                      </p>
                    </section>
                    {selected.state === 'paused' ? (
                      <Banner tone="info" title="Автоматизация приостановлена">
                        Новые запуски остановлены.{' '}
                        {selected.inFlight
                          ? `Уже начатый запуск ${selected.runId} продолжится.`
                          : 'Новый запуск не начнётся до возобновления.'}{' '}
                        Запланированные публикации в Telegram продолжат отправляться по расписанию.
                      </Banner>
                    ) : null}
                  </div>
                ) : (
                  <ol className={styles.history} aria-label="История запусков">
                    {selectedRuns.map((run) => (
                      <li key={run.id}>
                        <div className={styles.historyTop}>
                          <strong>{run.status}</strong>
                          <time>{run.time}</time>
                        </div>
                        <code className={kit.mono}>{run.id}</code>
                        <p>{run.message}</p>
                        <span className={kit.sub}>Длительность: {run.duration}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </TabPanel>
            </Tabs>
          </div>
        </Drawer>
      ) : null}
      <ConfirmDialog
        isOpen={Boolean(pausedTarget)}
        onOpenChange={(isDialogOpen) => !isDialogOpen && setPausedTarget(null)}
        title={pausedTarget ? `Приостановить «${pausedTarget.name}»?` : ''}
        description="Новые запуски этой автоматизации будут остановлены. Уже начатый запуск продолжится. Запланированные публикации в Telegram продолжат отправляться по расписанию."
        confirmLabel="Приостановить автоматизацию"
        cancelLabel="Оставить включённой"
        onConfirm={confirmPause}
      />
      <ConfirmDialog
        isOpen={Boolean(runTarget)}
        onOpenChange={(isDialogOpen) => !isDialogOpen && setRunTarget(null)}
        title={runTarget ? `Запустить «${runTarget.name}» сейчас?` : ''}
        description={
          runTarget
            ? `${runTarget.effects.join(' ')} Публикации не отправляются. Если запуск уже стоит в очереди или выполняется, запрос объединится с ним. Это только локальная имитация.`
            : ''
        }
        confirmLabel="Подтвердить запуск (демо)"
        cancelLabel="Отмена"
        onConfirm={confirmRun}
      />
    </PreviewPage>
  );
}
