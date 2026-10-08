/* oxlint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex, jsx-a11y/prefer-tag-over-role -- the chart is one keyboard-operable region (arrows move the data point) */
/* oxlint-disable react/set-state-in-effect -- dev-only prototype: fake loading when the period changes */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import {
  Button,
  Checkbox,
  DataTable,
  Drawer,
  EmptyState,
  ErrorState,
  IconButton,
  KpiTile,
  Panel,
  Select,
  Skeleton,
  VisuallyHidden,
  type DataColumn
} from '../../shared/ui';
import { TOP_POSTS, buildSeries, numberRu, shortDate, type DayPoint } from './preview-data';
import { DemoChip, Tag, Thumb, PreviewPage } from './preview-kit';
import { useNarrow, useProtoSearch, useScreenPhase } from './proto-kit';
import styles from './Analytics.module.css';
import kit from './Preview.module.css';

type Top = (typeof TOP_POSTS)[number];
const PERIODS = [
  { id: '7', label: '7 дней', days: 7 },
  { id: '30', label: '30 дней', days: 30 },
  { id: 'month', label: 'Месяц', days: 8 }
];
const CHANNELS = [
  { id: 'all', label: 'Все каналы' },
  { id: 'c1', label: 'Dota Pulse' },
  { id: 'c2', label: 'Тестовый канал' }
];
type SeriesKey = 'views' | 'reactions' | 'reposts';
const SERIES: ReadonlyArray<{ id: SeriesKey; label: string; dash?: string; width: number }> = [
  { id: 'views', label: 'Просмотры', width: 2.5 },
  { id: 'reactions', label: 'Реакции', width: 1.75 },
  { id: 'reposts', label: 'Репосты', dash: '6 4', width: 1.75 }
];
const strokeOf = (id: SeriesKey) =>
  id === 'views' ? 'var(--color-accent-text)' : id === 'reactions' ? 'var(--color-text)' : 'var(--color-text-muted)';

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => entry && setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

const PAD = { left: 8, right: 8, top: 12, bottom: 24 };

function LineChart({
  points,
  visible,
  height,
  loading
}: {
  points: DayPoint[];
  visible: ReadonlySet<SeriesKey>;
  height: number;
  loading: boolean;
}) {
  const [ref, width] = useWidth();
  const [active, setActive] = useState(() => Math.round(points.length * 0.62));
  const safe = Math.min(active, points.length - 1);
  const innerW = Math.max(width - PAD.left - PAD.right, 1);
  const innerH = height - PAD.top - PAD.bottom;
  const x = (index: number) => PAD.left + (points.length === 1 ? innerW / 2 : (index / (points.length - 1)) * innerW);
  // One shared scale: reactions and reposts stay small next to views, as they are.
  const maxOf = () => Math.max(...points.map((p) => p.views), 1);
  const y = (id: SeriesKey, value: number) => PAD.top + (1 - value / maxOf()) * innerH;
  const indexAt = (clientX: number) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return safe;
    const ratio = (clientX - rect.left - PAD.left) / innerW;
    return Math.max(0, Math.min(points.length - 1, Math.round(ratio * (points.length - 1))));
  };
  const onKey = (event: KeyboardEvent) => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (step) {
      event.preventDefault();
      setActive(Math.max(0, Math.min(points.length - 1, safe + step)));
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      setActive(event.key === 'Home' ? 0 : points.length - 1);
    }
  };
  const point = points[safe];
  const tipLeft = Math.max(4, Math.min(width - 200, x(safe) - 100));
  const labelEvery = Math.ceil(points.length / (width < 500 ? 4 : 8));
  return (
    <div
      ref={ref}
      className={styles.plot}
      style={{ height }}
      tabIndex={0}
      role="group"
      aria-label="График: просмотры, реакции и репосты по дням. Стрелки влево и вправо двигают точку."
      onKeyDown={onKey}
      onPointerMove={(event: PointerEvent) => !loading && setActive(indexAt(event.clientX))}
      onPointerDown={(event: PointerEvent) => !loading && setActive(indexAt(event.clientX))}
    >
      {width > 0 ? (
        <svg width={width} height={height} aria-hidden="true">
          {[0, 1, 2, 3].map((line) => (
            <line
              key={line}
              x1={PAD.left}
              x2={width - PAD.right}
              y1={PAD.top + (line / 3) * innerH}
              y2={PAD.top + (line / 3) * innerH}
              stroke="var(--color-grid)"
            />
          ))}
          {loading ? null : (
            <>
              {SERIES.filter((s) => visible.has(s.id)).map((series) => (
                <g key={series.id}>
                  {series.id === 'views' ? (
                    <path
                      d={`M${x(0)},${PAD.top + innerH} ${points.map((p, i) => `L${x(i)},${y('views', p.views)}`).join(' ')} L${x(points.length - 1)},${PAD.top + innerH}Z`}
                      fill="var(--color-accent-soft)"
                    />
                  ) : null}
                  <polyline
                    points={points.map((p, i) => `${x(i)},${y(series.id, p[series.id])}`).join(' ')}
                    fill="none"
                    stroke={strokeOf(series.id)}
                    strokeWidth={series.width}
                    strokeDasharray={series.dash}
                    strokeLinejoin="round"
                  />
                </g>
              ))}
              <line
                x1={x(safe)}
                x2={x(safe)}
                y1={PAD.top}
                y2={PAD.top + innerH}
                stroke="var(--color-border-strong)"
                strokeDasharray="3 3"
              />
              {SERIES.filter((s) => visible.has(s.id)).map((series) => (
                <circle
                  key={series.id}
                  cx={x(safe)}
                  cy={y(series.id, point?.[series.id] ?? 0)}
                  r={4}
                  fill="var(--color-surface-1)"
                  stroke={strokeOf(series.id)}
                  strokeWidth={2}
                />
              ))}
            </>
          )}
          {points.map((p, i) =>
            i % labelEvery === 0 ? (
              <text key={i} x={x(i)} y={height - 6} textAnchor="middle" fill="var(--color-text-muted)" fontSize={11}>
                {p.label}
              </text>
            ) : null
          )}
        </svg>
      ) : null}
      {!loading && point ? (
        <div className={styles.tip} style={{ left: tipLeft }} aria-hidden="true">
          <strong>{point.label}</strong>
          {SERIES.filter((s) => visible.has(s.id)).map((series) => (
            <span key={series.id}>
              <i style={{ background: strokeOf(series.id) }} data-dash={series.dash ? '' : undefined} />
              {series.label}
              <b>{numberRu(point[series.id])}</b>
            </span>
          ))}
        </div>
      ) : null}
      <VisuallyHidden>
        <span aria-live="polite">
          {point && !loading
            ? `${point.label}: просмотры ${numberRu(point.views)}, реакции ${numberRu(point.reactions)}, репосты ${numberRu(point.reposts)}`
            : ''}
        </span>
      </VisuallyHidden>
    </div>
  );
}

function Bars({
  points,
  field,
  tone,
  summary,
  loading
}: {
  points: DayPoint[];
  field: 'sent' | 'errors';
  tone: 'neutral' | 'danger';
  summary: string;
  loading: boolean;
}) {
  const [ref, width] = useWidth();
  const height = 140;
  const max = Math.max(...points.map((p) => p[field]), 1);
  const step = width / points.length;
  const barW = Math.max(2, Math.min(18, step * 0.62));
  const id = `hatch-${field}`;
  return (
    <div ref={ref} className={styles.bars} style={{ height }}>
      {width > 0 ? (
        <svg width={width} height={height} role="img" aria-label={summary}>
          <defs>
            <pattern id={id} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="6" height="6" fill="var(--color-status-failed-bg)" />
              <line x1="0" y1="0" x2="0" y2="6" stroke="var(--color-danger)" strokeWidth="3" />
            </pattern>
          </defs>
          <line x1={0} x2={width} y1={height - 22} y2={height - 22} stroke="var(--color-border-subtle)" />
          {loading
            ? null
            : points.map((p, i) => {
                const h = (p[field] / max) * (height - 44);
                const cx = i * step + step / 2;
                return (
                  <g key={i}>
                    <rect
                      x={cx - barW / 2}
                      y={height - 22 - h}
                      width={barW}
                      height={h}
                      rx={2}
                      fill={tone === 'danger' ? `url(#${id})` : 'var(--color-text-muted)'}
                      stroke={tone === 'danger' ? 'var(--color-danger)' : 'none'}
                    >
                      <title>{`${p.label}: ${p[field]}`}</title>
                    </rect>
                    {tone === 'danger' && p[field] > 0 ? (
                      <text x={cx} y={height - 26 - h} textAnchor="middle" fontSize={11} fill="var(--color-danger)">
                        {p[field]}
                      </text>
                    ) : null}
                  </g>
                );
              })}
          {[0, Math.floor(points.length / 2), points.length - 1].map((i) => (
            <text
              key={i}
              x={Math.max(14, Math.min(width - 14, i * step + step / 2))}
              y={height - 6}
              textAnchor="middle"
              fontSize={11}
              fill="var(--color-text-muted)"
            >
              {points[i]?.label}
            </text>
          ))}
        </svg>
      ) : null}
    </div>
  );
}

const regroup = (points: DayPoint[], weekly: boolean): DayPoint[] => {
  if (!weekly) return points;
  const result: DayPoint[] = [];
  for (let i = 0; i < points.length; i += 7) {
    const chunk = points.slice(i, i + 7);
    result.push({
      label: chunk[0]?.label ?? '',
      views: chunk.reduce((s, p) => s + p.views, 0),
      reactions: chunk.reduce((s, p) => s + p.reactions, 0),
      reposts: chunk.reduce((s, p) => s + p.reposts, 0),
      sent: chunk.reduce((s, p) => s + p.sent, 0),
      errors: chunk.reduce((s, p) => s + p.errors, 0)
    });
  }
  return result;
};

export function AnalyticsScreen() {
  const narrow = useNarrow();
  const { phase, retry } = useScreenPhase();
  const search = useProtoSearch();
  const [period, setPeriod] = useState(PERIODS.some((p) => p.id === search.period) ? (search.period ?? '30') : '30');
  const [offset, setOffset] = useState(0);
  const [channel, setChannel] = useState('all');
  const [group, setGroup] = useState('day');
  const [visible, setVisible] = useState<ReadonlySet<SeriesKey>>(new Set<SeriesKey>(['views', 'reactions', 'reposts']));
  const [fake, setFake] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [open, setOpen] = useState<Top | null>(null);
  const [draft, setDraft] = useState({ period: '30', channel: 'all' });

  // Every change of the period or channel re-renders the series after a short fake load, to show the skeleton.
  useEffect(() => {
    setFake(true);
    const timer = setTimeout(() => setFake(false), 400);
    return () => clearTimeout(timer);
  }, [period, offset, channel]);

  const days = PERIODS.find((p) => p.id === period)?.days ?? 30;
  const base = useMemo(
    () => buildSeries(days, CHANNELS.findIndex((c) => c.id === channel) + 1, offset),
    [days, channel, offset]
  );
  const points = regroup(base, group === 'week');
  const loading = phase === 'loading' || fake;
  const partial = search.state === 'partial';
  const total = (field: keyof DayPoint) =>
    base.reduce((s, p) => s + (typeof p[field] === 'number' ? (p[field] as number) : 0), 0);
  const er = ((total('reactions') + total('reposts')) / Math.max(total('views'), 1)) * 100;
  const chartH = narrow ? 180 : 220;
  const label = PERIODS.find((p) => p.id === period)?.label ?? '';

  const kpi = (title: string, value: string, hint: string, trend: number[], tone?: 'bad') =>
    loading ? (
      <div className={kit.kpiSkeleton}>
        <Skeleton height={12} width="55%" />
        <Skeleton height={28} width="35%" />
        <Skeleton height={12} width="70%" />
      </div>
    ) : (
      <div className={kit.kpiBox}>
        <KpiTile
          label={title}
          value={value}
          hint={hint}
          {...(narrow ? {} : { trend, trendLabel: `Динамика: ${title}`, tone: tone ?? 'accent' })}
        />
        <DemoChip />
      </div>
    );

  const columns: DataColumn<Top>[] = [
    { id: 'n', header: '№', cell: (row) => <span className={kit.mono}>{TOP_POSTS.indexOf(row) + 1}</span> },
    {
      id: 'title',
      header: 'Публикация',
      isRowHeader: true,
      cell: (row) => (
        <span className={styles.postCell}>
          <Thumb seed={row.title} size={40} label="" />
          <span className={kit.cellTitle}>
            <strong title={row.title}>{row.title}</strong>
            <span className={kit.sub}>{row.rubric}</span>
          </span>
        </span>
      )
    },
    { id: 'date', header: 'Дата', cell: (row) => <span className={kit.nowrap}>{shortDate(row.at)}</span> },
    {
      id: 'views',
      header: 'Просмотры',
      align: 'end',
      cell: (row) => <span className={kit.mono}>{numberRu(row.views)}</span>
    },
    {
      id: 'er',
      header: 'ER',
      align: 'end',
      compactSlot: 'trailing',
      cell: (row) => <span className={kit.mono}>{String(row.er.toFixed(1)).replace('.', ',')}%</span>
    }
  ];

  const controls = narrow ? (
    <Button
      variant="secondary"
      icon="settings"
      onPress={() => {
        setDraft({ period, channel });
        setSheet(true);
      }}
    >
      Период и канал
    </Button>
  ) : (
    <div className={kit.inlineRow}>
      <Select
        label="Период"
        inlineLabel
        options={PERIODS}
        value={period}
        onChange={(v) => {
          setPeriod(v);
          setOffset(0);
        }}
      />
      <IconButton label="Предыдущий период" icon="chevron-left" onPress={() => setOffset(offset + 1)} />
      <IconButton
        label="Следующий период"
        icon="chevron-right"
        isDisabled={offset === 0}
        onPress={() => setOffset(Math.max(0, offset - 1))}
      />
      <Select label="Канал" inlineLabel options={CHANNELS} value={channel} onChange={setChannel} />
    </div>
  );

  const errorBox = (retryable = true) => (
    <div className={styles.errorBox} style={{ minHeight: chartH + 60 }}>
      <ErrorState
        title="Не удалось загрузить"
        message="График пока недоступен. Остальные блоки работают."
        {...(retryable ? { onRetry: retry } : {})}
      />
    </div>
  );

  if (phase === 'empty') {
    return (
      <PreviewPage title="Аналитика">
        {controls}
        <Panel title="Просмотры и вовлечённость" marker={<DemoChip />} footer={<span> </span>}>
          <div className={styles.errorBox} style={{ minHeight: 360 }}>
            <EmptyState
              icon="search"
              title="За выбранный период нет публикаций"
              description="Выберите другой период или канал."
              action={
                <Button
                  variant="secondary"
                  onPress={() => {
                    setPeriod('30');
                    setOffset(0);
                    setChannel('all');
                  }}
                >
                  Выбрать другой период
                </Button>
              }
            />
          </div>
        </Panel>
      </PreviewPage>
    );
  }

  return (
    <PreviewPage title="Аналитика">
      {controls}
      <div className={kit.kpis}>
        {kpi(
          'Просмотры',
          numberRu(total('views')),
          label,
          base.map((p) => p.views)
        )}
        {kpi(
          'Отправлено постов',
          String(total('sent')),
          label,
          base.map((p) => p.sent)
        )}
        {kpi(
          'Ошибки отправки',
          String(total('errors')),
          label,
          base.map((p) => p.errors),
          'bad'
        )}
        {kpi(
          'Вовлечённость',
          `${er.toFixed(1).replace('.', ',')}%`,
          'реакции и репосты',
          base.map((p) => p.reactions + p.reposts)
        )}
      </div>
      <div className={styles.row}>
        <Panel
          title="Просмотры и вовлечённость"
          marker={<DemoChip />}
          action={
            <Select
              label="Группировка"
              options={[
                { id: 'day', label: 'По дням' },
                { id: 'week', label: 'По неделям' }
              ]}
              value={group}
              onChange={setGroup}
              isDisabled={days < 14}
            />
          }
          footer={
            <span>
              {period === 'month'
                ? 'Данные за сегодня неполные'
                : 'Единая шкала для всех рядов; точные значения во всплывающей подсказке'}
            </span>
          }
        >
          {phase === 'error' || partial ? (
            errorBox()
          ) : (
            <div className={styles.chartBody}>
              <ul className={styles.legend} aria-label="Ряды графика">
                {SERIES.map((series) => (
                  <li key={series.id}>
                    <Checkbox
                      isSelected={visible.has(series.id)}
                      onChange={(on) => {
                        const next = new Set(visible);
                        if (on) next.add(series.id);
                        else next.delete(series.id);
                        if (next.size > 0) setVisible(next);
                      }}
                    >
                      <svg width="26" height="10" aria-hidden="true">
                        <line
                          x1="1"
                          x2="25"
                          y1="5"
                          y2="5"
                          stroke={strokeOf(series.id)}
                          strokeWidth={series.width}
                          strokeDasharray={series.dash}
                        />
                      </svg>
                      {series.label}
                    </Checkbox>
                  </li>
                ))}
              </ul>
              <LineChart key={`${days}-${group}`} points={points} visible={visible} height={chartH} loading={loading} />
            </div>
          )}
        </Panel>
        <Panel title="Топ публикаций" marker={<DemoChip />} reserveRows={5} footer={<span>5 лучших за период</span>}>
          {phase === 'error' ? (
            errorBox()
          ) : (
            <DataTable
              flush
              density="compact"
              aria-label="Топ публикаций"
              columns={narrow ? columns.filter((c) => c.id !== 'n') : columns}
              rows={TOP_POSTS}
              getRowId={(row) => row.id}
              onRowAction={(id) => setOpen(TOP_POSTS.find((row) => row.id === id) ?? null)}
              isLoading={loading}
              loadingRows={5}
            />
          )}
        </Panel>
      </div>
      <div className={styles.pair}>
        <Panel title="Отправленные посты" marker={<DemoChip />} footer={<span>{total('sent')} за период</span>}>
          {phase === 'error' ? (
            errorBox()
          ) : (
            <Bars
              points={base}
              field="sent"
              tone="neutral"
              summary={`Отправлено постов по дням, всего ${total('sent')}`}
              loading={loading}
            />
          )}
        </Panel>
        <Panel
          title="Ошибки отправки"
          marker={<DemoChip />}
          footer={<span>{total('errors')} за период · цифры над столбцами</span>}
        >
          {phase === 'error' ? (
            errorBox()
          ) : (
            <Bars
              points={base}
              field="errors"
              tone="danger"
              summary={`Ошибки отправки по дням, всего ${total('errors')}`}
              loading={loading}
            />
          )}
        </Panel>
      </div>

      <Drawer
        variant="bottom"
        isOpen={sheet}
        onOpenChange={setSheet}
        title="Период и канал"
        footer={
          <Button
            onPress={() => {
              setPeriod(draft.period);
              setChannel(draft.channel);
              setOffset(0);
              setSheet(false);
            }}
          >
            Показать
          </Button>
        }
      >
        <div className={kit.stack}>
          <Select
            label="Период"
            options={PERIODS}
            value={draft.period}
            onChange={(v) => setDraft({ ...draft, period: v })}
          />
          <Select
            label="Канал"
            options={CHANNELS}
            value={draft.channel}
            onChange={(v) => setDraft({ ...draft, channel: v })}
          />
        </div>
      </Drawer>
      <Drawer
        variant={narrow ? 'bottom' : 'side'}
        isOpen={Boolean(open)}
        onOpenChange={(o) => !o && setOpen(null)}
        title={open?.title ?? ''}
        meta={open ? <Tag>{open.rubric}</Tag> : undefined}
        footer={
          <div className={kit.inlineRow}>
            <Button variant="secondary" isDisabled>
              Открыть пост
            </Button>
            <span className={kit.muted}>Недоступно в превью</span>
          </div>
        }
      >
        {open ? (
          <dl className={kit.facts}>
            <div className={kit.fact}>
              <dt>Дата</dt>
              <dd>{shortDate(open.at)}</dd>
            </div>
            <div className={kit.fact}>
              <dt>Просмотры</dt>
              <dd>{numberRu(open.views)}</dd>
            </div>
            <div className={kit.fact}>
              <dt>Реакции</dt>
              <dd>{numberRu(Math.round(open.views * 0.1))}</dd>
            </div>
            <div className={kit.fact}>
              <dt>Репосты</dt>
              <dd>{numberRu(Math.round(open.views * 0.03))}</dd>
            </div>
            <div className={kit.fact}>
              <dt>ER</dt>
              <dd>{String(open.er.toFixed(1)).replace('.', ',')}%</dd>
            </div>
          </dl>
        ) : null}
      </Drawer>
    </PreviewPage>
  );
}
