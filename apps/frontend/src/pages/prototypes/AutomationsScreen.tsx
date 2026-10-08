import { useState } from 'react';
import {
  Banner,
  Button,
  ColumnFilter,
  ConfirmDialog,
  DataTable,
  Drawer,
  EmptyState,
  ErrorState,
  IconButton,
  KpiTile,
  Menu,
  Panel,
  PanelList,
  Radio,
  RadioGroup,
  RowCard,
  SegmentedControl,
  SearchField,
  Skeleton,
  Switch,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  useToast,
  VisuallyHidden,
  type DataColumn,
  type IconName
} from '../../shared/ui';
import { NOW } from './data';
import { JOBS, agoText, inText, jobRuns, type Job, type JobRun } from './preview-data';
import { DemoChip, Pill, PreviewPage, usePreviewToast } from './preview-kit';
import { FooterLine, PhoneSkeletonRows } from './parts';
import { timeOf } from './preview-data';
import { useNarrow, useProtoSearch, useProtoSearchUpdate, useScreenPhase } from './proto-kit';
import styles from './Automations.module.css';
import kit from './Preview.module.css';

const STATUS_FILTER = [
  { id: 'all', label: 'Все' },
  { id: 'active', label: 'Активна' },
  { id: 'off', label: 'Выключена' },
  { id: 'failed', label: 'Ошибка' }
];
const TABS = [
  { id: 'overview', label: 'Обзор' },
  { id: 'logs', label: 'Логи' },
  { id: 'settings', label: 'Настройки' }
] as const;
type TabId = (typeof TABS)[number]['id'];

type View = { label: string; group: 'done' | 'muted' | 'failed' | 'unknown'; icon: IconName };
function viewOf(job: Job): View {
  if (job.state === 'unknown') return { label: 'Статус неизвестен', group: 'muted', icon: 'help' };
  if (!job.enabled) return { label: 'Выключена', group: 'muted', icon: 'pause' };
  if (job.state === 'failed') return { label: 'Ошибка', group: 'failed', icon: 'x-circle' };
  return { label: 'Активна', group: 'done', icon: 'check-circle' };
}
function StatusPill({ job }: { job: Job }) {
  const view = viewOf(job);
  return (
    <Pill group={view.group} icon={view.icon}>
      {view.label}
    </Pill>
  );
}
const nextText = (job: Job) =>
  job.enabled && job.nextIn !== null ? `${inText(job.nextIn)} · ${timeOf(NOW + job.nextIn * 60_000)}` : '—';

function LastRun({ job }: { job: Job }) {
  if (job.lastAgo === null) return <span className={kit.muted}>Не запускалась</span>;
  return (
    <span className={styles.lastRun}>
      <span className={kit.nowrap}>{agoText(job.lastAgo)}</span>
      <span className={kit.inlineRow}>
        {job.lastOk ? (
          <Pill group="done" icon="check">
            Успешно
          </Pill>
        ) : (
          <Pill group="failed" icon="x-circle">
            Ошибка
          </Pill>
        )}
        {job.stale && job.enabled ? (
          <Pill group="unknown" icon="alert">
            Не запускалась {job.lastAgo} мин
          </Pill>
        ) : null}
      </span>
    </span>
  );
}

type Handlers = { toggle: (job: Job, on: boolean) => void; busy: ReadonlySet<string> };

function JobSwitch({ job, handlers, showLabel = false }: { job: Job; handlers: Handlers; showLabel?: boolean }) {
  const narrow = useNarrow();
  return (
    <Switch
      aria-label={`Задача «${job.name}»`}
      isSelected={job.enabled}
      isDisabled={handlers.busy.has(job.id) || job.state === 'unknown'}
      onChange={(on) => handlers.toggle(job, on)}
    >
      {narrow || !showLabel ? (
        <VisuallyHidden>{job.enabled ? 'Вкл.' : 'Выкл.'}</VisuallyHidden>
      ) : job.enabled ? (
        'Вкл.'
      ) : (
        'Выкл.'
      )}
    </Switch>
  );
}

function Inspector({
  job,
  handlers,
  onClose,
  runNow
}: {
  job: Job;
  handlers: Handlers;
  onClose: () => void;
  runNow: () => void;
}) {
  const narrow = useNarrow();
  const search = useProtoSearch();
  const update = useProtoSearchUpdate();
  const toast = useToast();
  const preview = usePreviewToast();
  const tab: TabId = TABS.find((entry) => entry.id === search.tab)?.id ?? 'overview';
  const runs = jobRuns(job);
  const overview = (
    <div className={kit.stack}>
      {job.critical && !job.enabled ? (
        <Banner tone="warning" title="Публикации по расписанию не отправляются">
          Включите задачу, чтобы очередь снова заработала.
        </Banner>
      ) : null}
      <div className={styles.switchRow}>
        <span>{job.purpose}</span>
        <JobSwitch job={job} handlers={handlers} showLabel />
      </div>
      <dl className={kit.facts}>
        <div className={kit.fact}>
          <dt>Расписание</dt>
          <dd>
            <code className={kit.mono}>{job.cron}</code> · {job.human}
          </dd>
        </div>
        <div className={kit.fact}>
          <dt>Источник</dt>
          <dd>{job.source}</dd>
        </div>
        <div className={kit.fact}>
          <dt>Следующий</dt>
          <dd>{nextText(job)}</dd>
        </div>
        <div className={kit.fact}>
          <dt>Последний</dt>
          <dd>
            {job.lastAgo === null ? 'Не запускалась' : `${agoText(job.lastAgo)} · ${job.lastOk ? 'успешно' : 'ошибка'}`}
          </dd>
        </div>
        <div className={kit.fact}>
          <dt>Длительность</dt>
          <dd>{job.duration ? `${String(job.duration).replace('.', ',')} с` : '—'}</dd>
        </div>
      </dl>
      <section className={kit.stack}>
        <h3 className={kit.sectionTitle}>Что делает задача</h3>
        <ul className={styles.does}>
          {job.does.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>
    </div>
  );
  const logs = (
    <ul className={styles.logs} aria-label="Последние запуски">
      {runs.map((run) => (
        <li key={run.id}>
          <span className={styles.logTop}>
            <span className={kit.nowrap}>{agoText(run.ago)}</span>
            {run.ok ? (
              <Pill group="done" icon="check">
                Успешно
              </Pill>
            ) : (
              <Pill group="failed" icon="x-circle">
                Ошибка
              </Pill>
            )}
            <span className={`${kit.mono} ${kit.muted}`}>{String(run.duration).replace('.', ',')} с</span>
            <IconButton
              label={`Копировать id запуска ${run.id}`}
              icon="copy"
              size="sm"
              onPress={() => toast.show({ title: 'Идентификатор скопирован', tone: 'success' })}
            />
          </span>
          <span className={kit.sub}>{run.message}</span>
        </li>
      ))}
    </ul>
  );
  const settings = (
    <div className={kit.stack}>
      <dl className={kit.facts}>
        <div className={kit.fact}>
          <dt>Повторы</dt>
          <dd>3 попытки</dd>
        </div>
        <div className={kit.fact}>
          <dt>Пауза</dt>
          <dd>30 с между попытками</dd>
        </div>
        <div className={kit.fact}>
          <dt>Таймаут</dt>
          <dd>2 минуты на запуск</dd>
        </div>
      </dl>
      <div className={kit.inlineRow}>
        <Button variant="secondary" isDisabled onPress={() => preview()}>
          Изменить
        </Button>
        <span className={kit.muted}>Недоступно в превью</span>
      </div>
    </div>
  );
  return (
    <Drawer
      variant={narrow ? 'bottom' : 'side'}
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title={job.name}
      meta={<StatusPill job={job} />}
      footer={
        <Button variant="secondary" icon="zap" isDisabled={!job.enabled} onPress={runNow}>
          Запустить сейчас
        </Button>
      }
    >
      {narrow ? (
        <div className={kit.stack}>
          <SegmentedControl
            label="Раздел задачи"
            fullWidth
            value={tab}
            onChange={(id) => update({ tab: id === 'overview' ? undefined : id })}
            options={TABS.map((entry) => ({ id: entry.id, label: entry.label }))}
          />
          {tab === 'overview' ? overview : tab === 'logs' ? logs : settings}
        </div>
      ) : (
        <Tabs
          selectedKey={tab}
          onSelectionChange={(key) => update({ tab: key === 'overview' ? undefined : String(key) })}
        >
          <TabList aria-label="Разделы задачи">
            {TABS.map((entry) => (
              <Tab key={entry.id} id={entry.id}>
                {entry.label}
              </Tab>
            ))}
          </TabList>
          <TabPanel id="overview">{overview}</TabPanel>
          <TabPanel id="logs">{logs}</TabPanel>
          <TabPanel id="settings">{settings}</TabPanel>
        </Tabs>
      )}
    </Drawer>
  );
}

export function AutomationsScreen() {
  const narrow = useNarrow();
  const { phase, retry } = useScreenPhase();
  const search = useProtoSearch();
  const update = useProtoSearchUpdate();
  const toast = useToast();
  const preview = usePreviewToast();
  const [jobs, setJobs] = useState<Job[]>(JOBS);
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const [stopping, setStopping] = useState<Job | null>(null);
  const [running, setRunning] = useState<Job | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const view = search.view === 'runs' ? 'runs' : 'jobs';

  const withBusy = (id: string, run: () => void) => {
    setBusy((current) => new Set(current).add(id));
    setTimeout(() => {
      run();
      setBusy((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }, 600);
  };
  const setEnabled = (id: string, enabled: boolean) =>
    setJobs((current) =>
      current.map((job) =>
        job.id === id
          ? {
              ...job,
              enabled,
              nextIn: enabled ? (job.nextIn ?? 5) : null,
              state: job.state === 'off' ? 'active' : job.state
            }
          : job
      )
    );
  const enable = (job: Job) =>
    withBusy(job.id, () => {
      setEnabled(job.id, true);
      toast.show({
        title: `Задача включена, следующий запуск ${timeOf(NOW + (job.nextIn ?? 5) * 60_000)}`,
        tone: 'success'
      });
    });
  const handlers: Handlers = {
    busy,
    toggle: (job, on) => (on ? enable(job) : setStopping(job))
  };
  const confirmStop = () => {
    const job = stopping;
    if (!job) return;
    setStopping(null);
    withBusy(job.id, () => {
      setEnabled(job.id, false);
      toast.show({
        title: 'Задача остановлена',
        description: `«${job.name}»`,
        tone: 'info',
        timeout: 8000,
        action: { label: 'Вернуть', onPress: () => enable(job) }
      });
    });
  };

  const needle = query.trim().toLowerCase();
  const rows = jobs.filter(
    (job) =>
      (!needle || job.name.toLowerCase().includes(needle)) &&
      (status === 'all' ||
        (status === 'active'
          ? job.enabled && job.state === 'active'
          : status === 'off'
            ? !job.enabled
            : job.state === 'failed'))
  );
  const active = jobs.find((job) => job.id === search.id);
  const enabledJobs = jobs.filter((job) => job.enabled && job.state !== 'unknown');
  const soonest = enabledJobs.filter((job) => job.nextIn !== null).sort((a, b) => (a.nextIn ?? 0) - (b.nextIn ?? 0))[0];
  const blank = phase === 'empty';
  const ready = phase === 'ready' && !blank;
  const open = (id: string, tab?: TabId) => update({ id, tab: tab && tab !== 'overview' ? tab : undefined }, false);

  const columns: DataColumn<Job>[] = [
    {
      id: 'name',
      header: 'Название',
      isRowHeader: true,
      headerControl: (
        <ColumnFilter label="Поиск по названию" icon="search" isActive={query.trim() !== ''}>
          <SearchField label="Название задачи" placeholder="Что ищем?" value={query} onChange={setQuery} />
        </ColumnFilter>
      ),
      cell: (job) => (
        <span className={`${kit.cellTitle} ${styles.name}`}>
          <strong>{job.name}</strong>
          <span className={kit.sub}>{job.purpose}</span>
        </span>
      )
    },
    {
      id: 'cron',
      header: 'Расписание',
      cell: (job) => (
        <span className={`${kit.cellTitle} ${styles.cron}`}>
          <code className={kit.mono}>{job.cron}</code>
          <span className={kit.sub}>{job.human}</span>
        </span>
      )
    },
    {
      id: 'next',
      header: 'Следующий',
      cell: (job) =>
        job.enabled && job.nextIn !== null ? (
          <span className={`${kit.cellTitle} ${styles.cron}`}>
            <strong className={kit.mono}>{timeOf(NOW + job.nextIn * 60_000)}</strong>
            <span className={kit.sub}>{inText(job.nextIn)}</span>
          </span>
        ) : (
          '—'
        )
    },
    { id: 'last', header: 'Последний запуск', cell: (job) => <LastRun job={job} /> },
    {
      id: 'duration',
      header: 'Длительность',
      cell: (job) => (
        <span className={kit.mono}>{job.duration ? `${String(job.duration).replace('.', ',')} с` : '—'}</span>
      )
    },
    {
      id: 'status',
      header: 'Статус',
      headerControl: (
        <ColumnFilter label="Фильтр по статусу" isActive={status !== 'all'}>
          <RadioGroup label="Статус" value={status} onChange={setStatus}>
            {STATUS_FILTER.map((option) => (
              <Radio key={option.id} value={option.id}>
                {option.label}
              </Radio>
            ))}
          </RadioGroup>
        </ColumnFilter>
      ),
      cell: (job) => <StatusPill job={job} />
    },
    { id: 'switch', header: 'Вкл.', cell: (job) => <JobSwitch job={job} handlers={handlers} /> },
    {
      id: 'actions',
      header: 'Действия',
      align: 'end',
      cell: (job) => (
        <Menu
          label={`Действия: ${job.name}`}
          items={[
            { id: 'open', label: 'Открыть', icon: 'link' },
            { id: 'run', label: 'Запустить сейчас', icon: 'zap', isDisabled: !job.enabled },
            ...(job.state === 'failed' ? [{ id: 'logs', label: 'Открыть логи', icon: 'list' as IconName }] : [])
          ]}
          onAction={(id) => (id === 'run' ? setRunning(job) : open(job.id, id === 'logs' ? 'logs' : 'overview'))}
        />
      )
    }
  ];

  const allRuns: Array<JobRun & { name: string }> = jobs
    .flatMap((job) =>
      jobRuns(job)
        .slice(0, 3)
        .map((run) => ({ ...run, name: job.name }))
    )
    .sort((a, b) => a.ago - b.ago)
    .slice(0, 12);
  const runColumns: DataColumn<JobRun & { name: string }>[] = [
    { id: 'name', header: 'Задача', isRowHeader: true, cell: (run) => run.name },
    { id: 'time', header: 'Время', cell: (run) => <span className={kit.nowrap}>{agoText(run.ago)}</span> },
    {
      id: 'result',
      header: 'Результат',
      compactSlot: 'trailing',
      cell: (run) =>
        run.ok ? (
          <Pill group="done" icon="check">
            Успешно
          </Pill>
        ) : (
          <Pill group="failed" icon="x-circle">
            Ошибка
          </Pill>
        )
    },
    {
      id: 'duration',
      header: 'Длительность',
      cell: (run) => <span className={kit.mono}>{String(run.duration).replace('.', ',')} с</span>
    },
    { id: 'message', header: 'Сообщение', cell: (run) => <span className={kit.muted}>{run.message}</span> }
  ];

  const kpi = (label: string, value: string, hint: string) =>
    phase === 'loading' ? (
      <div className={kit.kpiSkeleton}>
        <Skeleton height={12} width="55%" />
        <Skeleton height={28} width="35%" />
        <Skeleton height={12} width="70%" />
      </div>
    ) : (
      <div className={kit.kpiBox}>
        <KpiTile label={label} value={value} hint={hint} />
        <DemoChip />
      </div>
    );

  let body;
  if (phase === 'error') {
    body = (
      <div className={styles.fill}>
        <ErrorState
          message="Не удалось загрузить задачи. Расписание не затронуто."
          requestId="req_7a90d2f1"
          onRetry={retry}
        />
      </div>
    );
  } else if (view === 'runs') {
    body = (
      <DataTable
        flush
        aria-label="Последние запуски"
        columns={runColumns}
        rows={allRuns}
        getRowId={(r) => r.id}
        isLoading={phase === 'loading'}
        loadingRows={7}
        density="compact"
      />
    );
  } else if (phase === 'loading') {
    body = narrow ? (
      <PhoneSkeletonRows label="Загрузка задач" count={7} />
    ) : (
      <DataTable
        flush
        aria-label="Загрузка задач"
        columns={columns}
        rows={[]}
        getRowId={(r) => r.id}
        isLoading
        loadingRows={7}
      />
    );
  } else if (blank) {
    body = (
      <EmptyState
        icon="zap"
        title="Задач пока нет"
        description="Они появятся, когда будут настроены автоматизации: импорт событий, очередь публикаций."
      />
    );
  } else if (rows.length === 0) {
    body = (
      <EmptyState
        icon="search"
        title="Ничего не найдено"
        description="Измените запрос или фильтр."
        action={
          <Button
            variant="secondary"
            onPress={() => {
              setQuery('');
              setStatus('all');
            }}
          >
            Сбросить фильтры
          </Button>
        }
      />
    );
  } else if (narrow) {
    body = (
      <PanelList aria-label="Задачи">
        {rows.map((job) => (
          <RowCard
            key={job.id}
            title={job.name}
            status={<StatusPill job={job} />}
            meta={`${job.human}${job.enabled && job.nextIn !== null ? ` · след. ${timeOf(NOW + job.nextIn * 60_000)}` : ''}`}
            {...(job.stale && job.enabled
              ? { warning: `Не запускалась ${job.lastAgo} мин` }
              : job.state === 'failed'
                ? { warning: 'Последний запуск с ошибкой' }
                : {})}
            isActive={search.id === job.id}
            onPress={() => open(job.id)}
            menu={<JobSwitch job={job} handlers={handlers} />}
          />
        ))}
      </PanelList>
    );
  } else {
    body = (
      <DataTable
        flush
        rowHeight="tall"
        aria-label="Задачи"
        columns={columns}
        rows={rows}
        getRowId={(r) => r.id}
        activeId={search.id}
        onRowAction={(id) => open(id)}
      />
    );
  }

  return (
    <PreviewPage title="Автоматизации">
      <div className={kit.kpis}>
        {kpi('Всего задач', String(jobs.length), 'в расписании')}
        {kpi('Активные', String(enabledJobs.length), `из ${jobs.length}`)}
        {kpi(
          'Следующий запуск',
          soonest?.nextIn != null ? inText(soonest.nextIn) : '—',
          soonest?.name ?? 'нет в плане'
        )}
        {kpi('Источники', String(new Set(jobs.map((job) => job.source)).size), 'используются задачами')}
      </div>
      <Tabs
        selectedKey={view}
        onSelectionChange={(key) => update({ view: key === 'jobs' ? undefined : String(key), id: undefined })}
      >
        <TabList aria-label="Разделы автоматизаций">
          <Tab id="jobs">Задачи</Tab>
          <Tab id="runs">Последние запуски</Tab>
        </TabList>
      </Tabs>
      <Panel
        title={view === 'runs' ? 'Последние запуски' : 'Задачи'}
        marker={<DemoChip />}
        reserveRows={ready ? undefined : narrow ? 7 : 8}
        footer={
          <FooterLine
            text={
              ready
                ? view === 'runs'
                  ? `Показано ${allRuns.length}`
                  : `${rows.length} из ${jobs.length}`
                : phase === 'loading'
                  ? 'Загружаем…'
                  : ' '
            }
          />
        }
        action={
          !narrow && view === 'jobs' && ready && (query.trim() || status !== 'all') ? (
            <Button
              variant="ghost"
              size="sm"
              icon="x"
              onPress={() => {
                setQuery('');
                setStatus('all');
              }}
            >
              Сбросить фильтры
            </Button>
          ) : undefined
        }
      >
        {body}
      </Panel>

      {active ? (
        <Inspector
          key={active.id}
          job={active}
          handlers={handlers}
          onClose={() => update({ id: undefined, tab: undefined })}
          runNow={() => setRunning(active)}
        />
      ) : null}
      <ConfirmDialog
        isOpen={Boolean(stopping)}
        onOpenChange={(open) => !open && setStopping(null)}
        title={stopping ? `Остановить задачу «${stopping.name}»?` : ''}
        description={
          stopping?.critical
            ? 'Запланированные посты перестанут уходить в Telegram, пока вы её не включите.'
            : 'Задача не будет запускаться, пока вы её не включите.'
        }
        confirmLabel="Остановить"
        cancelLabel="Отмена"
        onConfirm={confirmStop}
      />
      <ConfirmDialog
        isOpen={Boolean(running)}
        onOpenChange={(open) => !open && setRunning(null)}
        title={running ? `Запустить «${running.name}» сейчас?` : ''}
        description="Задача выполнится вне расписания один раз. Следующий плановый запуск не изменится."
        confirmLabel="Запустить сейчас"
        cancelLabel="Не запускать"
        tone="default"
        onConfirm={() => {
          setRunning(null);
          preview();
        }}
      />
    </PreviewPage>
  );
}
