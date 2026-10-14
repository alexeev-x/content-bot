import type {
  PublicationAnalyticsQuery,
  PublicationAnalyticsReportDto,
  PublicationAnalyticsRowDto
} from '@alexeev/contracts';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ApiError } from '../../../shared/api/http-client';
import { ownerDaysRange, utcOffsetLabel } from '../../../shared/lib/owner-timezone';
import { useNow } from '../../../shared/lib/use-now';
import { publicationAnalyticsQueryOptions } from '../api/analytics-queries';
import {
  AppliedChips,
  Button,
  Drawer,
  EmptyState,
  ErrorState,
  FilterButton,
  FilterSheet,
  PageHeader,
  Panel,
  Select,
  Skeleton,
  StatusBadge,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  useMediaQuery
} from '../../../shared/ui';
import styles from './AnalyticsReport.module.css';

export type AnalyticsSearch = Partial<Pick<PublicationAnalyticsQuery, 'from' | 'to' | 'comparison'>> & {
  destinationId?: string;
  mediaKind?: PublicationAnalyticsQuery['mediaKind'];
  outcome?: PublicationAnalyticsQuery['outcome'];
  cursor?: string;
  publicationId?: string;
};
export type AnalyticsSearchChange = (patch: Partial<AnalyticsSearch>, options?: { replace?: boolean }) => void;

type Props = {
  search: AnalyticsSearch;
  timezone: string;
  onSearchChange: AnalyticsSearchChange;
  onOpenPublication: (id: string) => void;
  onLogin: () => void;
  /** Pass to the focused screen tests; production leaves the shared 30-second freshness. */
  staleTime?: number;
};

const LIMIT = 20;
const PERIODS = [
  { id: '7', label: 'Последние 7 дней' },
  { id: '30', label: 'Последние 30 дней' },
  { id: '90', label: 'Последние 90 дней' }
] as const;
const MEDIA = [
  { id: 'all', label: 'Все типы медиа' },
  { id: 'photo', label: 'Фото' },
  { id: 'animation', label: 'Анимация' },
  { id: 'video', label: 'Видео' }
] as const;
const OUTCOMES = [
  { id: 'all', label: 'Все результаты' },
  { id: 'sent', label: 'Отправлено' },
  { id: 'failed', label: 'Ошибка' },
  { id: 'unknown', label: 'Требует проверки' }
] as const;
const OUTCOME_STATUS = { sent: 'sent', failed: 'failed', unknown: 'unknown' } as const;

type Draft = { period: string; destinationId: string; mediaKind: string; outcome: string };
const dateRange = (period: string, now: Date, zone: string) => ownerDaysRange(now, zone, Number(period) || 30);
const periodFor = (search: AnalyticsSearch, now: Date, zone: string) =>
  PERIODS.find(({ id }) => {
    const range = dateRange(id, now, zone);
    return range.from === search.from && range.to === search.to;
  })?.id ?? '30';
const toQuery = (search: AnalyticsSearch): PublicationAnalyticsQuery | null => {
  if (!search.from || !search.to) return null;
  return {
    from: search.from,
    to: search.to,
    comparison: search.comparison ?? 'destination',
    limit: LIMIT,
    ...(search.destinationId ? { destinationId: search.destinationId } : {}),
    ...(search.mediaKind ? { mediaKind: search.mediaKind } : {}),
    ...(search.outcome ? { outcome: search.outcome } : {}),
    ...(search.cursor ? { cursor: search.cursor } : {})
  };
};

function formatInstant(value: string, zone: string) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: zone
  }).format(new Date(value));
}
function mediaLabel(kind: string) {
  return kind === 'photo' ? 'Фото' : kind === 'animation' ? 'Анимация' : 'Видео';
}
function errorText(error: unknown): { message: string; requestId?: string } {
  if (error instanceof ApiError) {
    return {
      message:
        error.status === 0
          ? 'Не удалось загрузить отчёт. Проверьте подключение и повторите попытку.'
          : 'Не удалось обновить отчёт. Повторите безопасный запрос.',
      ...(error.requestId ? { requestId: error.requestId } : {})
    };
  }
  return { message: 'Не удалось обновить отчёт. Повторите безопасный запрос.' };
}

function Summary({ report }: { report: PublicationAnalyticsReportDto }) {
  const values = [
    ['Отправлено', report.summary.sent],
    ['Ошибки', report.summary.failed],
    ['Требуют проверки', report.summary.unknown],
    ['Попытки', report.summary.attempts],
    ['Повторы', report.summary.retries]
  ] as const;
  return (
    <div className={styles.summary} aria-label="Итоги публикаций">
      {values.map(([label, value]) => (
        <div key={label}>
          <strong>{value}</strong>
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}

function ReportTable({
  report,
  zone,
  onOpen,
  registerRow,
  onClear
}: {
  report: PublicationAnalyticsReportDto;
  zone: string;
  onOpen: (row: PublicationAnalyticsRowDto) => void;
  registerRow: (id: string, node: HTMLButtonElement | null) => void;
  onClear: () => void;
}) {
  if (report.publications.items.length === 0)
    return (
      <EmptyState
        title="Нет публикаций по выбранным фильтрам"
        description="Измените период или снимите фильтры, чтобы проверить другие наблюдения."
        action={
          <Button variant="secondary" onPress={onClear}>
            Сбросить фильтры
          </Button>
        }
      />
    );
  return (
    <>
      {/* Keep the horizontal-scroll region keyboard reachable on compact screens. */}
      {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- region scrolls horizontally as a table. */}
      <section className={styles.tableWrap} aria-label="Публикации отчёта" tabIndex={0}>
        <table className={styles.table}>
          <caption className={styles.srOnly}>Публикации и их результаты в выбранном периоде</caption>
          <thead>
            <tr>
              <th scope="col">Публикация</th>
              <th scope="col">Результат</th>
              <th scope="col">Наблюдалось</th>
              <th scope="col">Попытки</th>
              <th scope="col">Повторы</th>
              <th scope="col">Канал</th>
              <th scope="col">Медиа</th>
            </tr>
          </thead>
          <tbody>
            {report.publications.items.map((row) => (
              <tr key={row.publicationId}>
                <th scope="row">
                  <button
                    aria-label={`${row.title || 'Публикация без названия'}. Открыть публикацию`}
                    ref={(node) => registerRow(row.publicationId, node)}
                    className={styles.rowButton}
                    onClick={() => onOpen(row)}
                  >
                    <span>{row.title || 'Публикация без названия'}</span>
                    <small>Открыть публикацию</small>
                  </button>
                </th>
                <td>
                  <StatusBadge status={OUTCOME_STATUS[row.outcome]} />
                </td>
                <td>
                  {formatInstant(row.observedAt, zone)}
                  <small>
                    {zone} ({utcOffsetLabel(new Date(row.observedAt), zone)}), снимок наблюдения
                  </small>
                </td>
                <td>{row.attemptCount}</td>
                <td>{row.retryCount}</td>
                <td>{row.destinationTitle ?? 'Канал недоступен'}</td>
                <td>
                  {row.mediaKinds === null
                    ? 'Не записано'
                    : row.mediaKinds.length
                      ? row.mediaKinds.map(mediaLabel).join(', ')
                      : 'Без медиа'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <p className={styles.footer}>
        Показано {report.publications.items.length} · снимок отчёта: {formatInstant(report.observedAt, zone)} {zone}
      </p>
    </>
  );
}

function Comparison({ report, mode }: { report: PublicationAnalyticsReportDto; mode: AnalyticsSearch['comparison'] }) {
  const groups = report.groups;
  return (
    <>
      {/* Keep the horizontal-scroll region keyboard reachable on compact screens. */}
      {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- region scrolls horizontally as a table. */}
      <section className={styles.tableWrap} aria-label="Сравнение абсолютных показателей" tabIndex={0}>
        <table className={`${styles.table} ${styles.comparison}`}>
          <caption className={styles.srOnly}>Абсолютные количества по выбранному измерению</caption>
          <thead>
            <tr>
              <th scope="col">{mode === 'destination' ? 'Канал' : 'Тип медиа'}</th>
              <th scope="col">Учтено</th>
              <th scope="col">Отправлено</th>
              <th scope="col">Ошибки</th>
              <th scope="col">Требуют проверки</th>
              <th scope="col">Покрытие</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <tr key={group.key}>
                <th scope="row">{group.label}</th>
                <td>{group.counts.publications}</td>
                <td>{group.counts.sent}</td>
                <td>{group.counts.failed}</td>
                <td>{group.counts.unknown}</td>
                <td>
                  {group.coveredPublications} учтено · {group.unrecordedPublications} не записано
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {mode === 'media' ? (
        <p className={styles.note}>
          Медиа указано у {report.mediaCoverage.recorded} публикаций; не записано у {report.mediaCoverage.unrecorded}.
          Значения не восстанавливаются по текущему состоянию поста.
        </p>
      ) : null}
    </>
  );
}

export function AnalyticsReport({
  search,
  timezone: zone,
  onSearchChange,
  onOpenPublication,
  onLogin,
  staleTime = 30_000
}: Props) {
  const now = useNow();
  const narrow = useMediaQuery('(max-width: 859px)');
  useEffect(() => {
    const previous = document.title;
    document.title = 'Аналитика публикаций — ALEXEEV Studio';
    return () => {
      document.title = previous;
    };
  }, []);
  const effectiveSearch = useMemo(
    () =>
      search.from && search.to
        ? { ...search, comparison: search.comparison ?? ('destination' as const) }
        : { ...search, ...dateRange('30', now, zone), comparison: search.comparison ?? ('destination' as const) },
    [now, search, zone]
  );
  useEffect(() => {
    if (!search.from || !search.to || !search.comparison) {
      onSearchChange(
        { from: effectiveSearch.from, to: effectiveSearch.to, comparison: effectiveSearch.comparison },
        { replace: true }
      );
    }
  }, [
    effectiveSearch.comparison,
    effectiveSearch.from,
    effectiveSearch.to,
    onSearchChange,
    search.comparison,
    search.from,
    search.to
  ]);
  const queryInput = toQuery(effectiveSearch);
  const fallbackQuery = {
    from: '1970-01-01T00:00:00.000Z',
    to: '1970-01-02T00:00:00.000Z',
    comparison: 'destination' as const,
    limit: LIMIT
  };
  const query = useQuery({
    ...publicationAnalyticsQueryOptions(queryInput ?? fallbackQuery),
    enabled: queryInput !== null,
    staleTime
  });
  const [sheetOpen, setSheetOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => ({
    period: periodFor(effectiveSearch, now, zone),
    destinationId: search.destinationId ?? 'all',
    mediaKind: search.mediaKind ?? 'all',
    outcome: search.outcome ?? 'all'
  }));
  const [detail, setDetail] = useState<PublicationAnalyticsRowDto | null>(null);
  const rows = query.data?.publications.items ?? [];
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());
  const previousDetail = useRef<string | null>(null);
  const periodChoices = PERIODS.map(({ id, label }) => ({ id, label }));
  const destinationChoices = useMemo(() => {
    const values = new Map<string, string>();
    for (const row of rows) values.set(row.destinationId, row.destinationTitle ?? 'Канал недоступен');
    return [{ id: 'all', label: 'Все каналы' }, ...[...values].map(([id, label]) => ({ id, label }))];
  }, [rows]);
  const activePeriod = periodFor(effectiveSearch, now, zone);
  const accessDenied =
    query.isError && query.error instanceof ApiError && (query.error.status === 401 || query.error.status === 403);
  const filterCount =
    Number(Boolean(search.destinationId)) + Number(Boolean(search.mediaKind)) + Number(Boolean(search.outcome));
  const labels = [
    search.destinationId
      ? {
          id: 'destinationId',
          label: `Канал: ${destinationChoices.find((item) => item.id === search.destinationId)?.label ?? 'Выбран'}`
        }
      : null,
    search.mediaKind ? { id: 'mediaKind', label: `Медиа: ${mediaLabel(search.mediaKind)}` } : null,
    search.outcome
      ? {
          id: 'outcome',
          label: `Результат: ${OUTCOMES.find(({ id }) => id === search.outcome)?.label ?? search.outcome}`
        }
      : null
  ].filter((item): item is { id: string; label: string } => item !== null);
  const apply = (next: Draft) => {
    const range = dateRange(next.period, now, zone);
    onSearchChange({
      ...range,
      destinationId: next.destinationId === 'all' ? undefined : next.destinationId,
      mediaKind: next.mediaKind === 'all' ? undefined : (next.mediaKind as PublicationAnalyticsQuery['mediaKind']),
      outcome: next.outcome === 'all' ? undefined : (next.outcome as PublicationAnalyticsQuery['outcome']),
      cursor: undefined,
      publicationId: undefined
    });
    setDraft(next);
    setSheetOpen(false);
  };
  // Only a committed URL change restores the draft. Clock ticks must not erase operator edits.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    setDraft({
      period: periodFor(effectiveSearch, now, zone),
      destinationId: search.destinationId ?? 'all',
      mediaKind: search.mediaKind ?? 'all',
      outcome: search.outcome ?? 'all'
    });
  }, [effectiveSearch.from, effectiveSearch.to, search.destinationId, search.mediaKind, search.outcome, zone]);
  const fields = (
    <>
      <Select
        label="Период"
        value={draft.period}
        options={periodChoices}
        onChange={(period) => setDraft({ ...draft, period })}
      />
      <Select
        label="Канал"
        value={draft.destinationId}
        options={destinationChoices}
        onChange={(destinationId) => setDraft({ ...draft, destinationId })}
      />
      <Select
        label="Медиа"
        value={draft.mediaKind}
        options={MEDIA}
        onChange={(mediaKind) => setDraft({ ...draft, mediaKind })}
      />
      <Select
        label="Результат"
        value={draft.outcome}
        options={OUTCOMES}
        onChange={(outcome) => setDraft({ ...draft, outcome })}
      />
    </>
  );
  const filters = (
    <div className={styles.filters}>
      {fields}
      <Button onPress={() => apply(draft)}>Применить</Button>
    </div>
  );
  const openRow = (row: PublicationAnalyticsRowDto) => {
    setDetail(row);
    onSearchChange({ publicationId: row.publicationId });
  };
  useEffect(() => {
    if (search.publicationId) {
      previousDetail.current = search.publicationId;
      setDetail(rows.find((row) => row.publicationId === search.publicationId) ?? null);
      return;
    }
    if (previousDetail.current) {
      const id = previousDetail.current;
      previousDetail.current = null;
      setDetail(null);
      const frame = window.requestAnimationFrame(() => rowRefs.current.get(id)?.focus());
      return () => window.cancelAnimationFrame(frame);
    }
    setDetail(null);
    return undefined;
  }, [rows, search.publicationId]);

  const currentError = errorText(query.error);
  return (
    <main className={styles.page}>
      <PageHeader
        title="Аналитика публикаций — ALEXEEV Studio"
        description="Снимки результатов, записанные Studio"
        focusHeadingOnMount
      />
      <section className={styles.toolbar} aria-label="Фильтры отчёта">
        {narrow ? (
          <>
            <p className={styles.periodNote}>
              Период: {effectiveSearch.from && formatInstant(effectiveSearch.from, zone)} —{' '}
              {effectiveSearch.to && formatInstant(effectiveSearch.to, zone)} · {zone}, {utcOffsetLabel(now, zone)}
            </p>
            <FilterButton count={filterCount} onPress={() => setSheetOpen(true)} />
          </>
        ) : (
          filters
        )}
      </section>
      <AppliedChips
        chips={labels}
        onRemove={(id) => onSearchChange({ [id]: undefined, cursor: undefined } as Partial<AnalyticsSearch>)}
      />
      <FilterSheet
        isOpen={sheetOpen}
        onOpenChange={setSheetOpen}
        count={filterCount}
        onReset={() => setDraft({ period: activePeriod, destinationId: 'all', mediaKind: 'all', outcome: 'all' })}
        onApply={() => apply(draft)}
      >
        <div className={styles.sheetFields}>{fields}</div>
      </FilterSheet>
      {query.isPending ? (
        <section className={styles.loading} aria-busy="true" aria-label="Загружаем аналитику">
          <Skeleton height={94} />
          <Skeleton height={320} />
        </section>
      ) : null}
      {query.isError && query.error instanceof ApiError && query.error.status === 401 ? (
        <ErrorState
          title="Войдите снова, чтобы открыть аналитику"
          message="Сессия завершена. Данные отчёта не загружены."
          action={<Button onPress={onLogin}>Перейти ко входу</Button>}
        />
      ) : null}
      {query.isError && query.error instanceof ApiError && query.error.status === 403 ? (
        <ErrorState
          title="Нет доступа к аналитике"
          message="Отчёт доступен только владельцу Studio. Данные не загружены."
        />
      ) : null}
      {query.isError && !(query.error instanceof ApiError && [401, 403].includes(query.error.status)) ? (
        <ErrorState
          title="Отчёт не обновлён"
          message={currentError.message}
          requestId={currentError.requestId}
          onRetry={() => void query.refetch()}
        />
      ) : null}
      {query.data && !accessDenied ? (
        <Panel
          title="Результаты публикаций"
          note={`${formatInstant(query.data.from, zone)} — ${formatInstant(query.data.to, zone)} · ${zone}, ${utcOffsetLabel(now, zone)}`}
        >
          <Summary report={query.data} />
          <p className={styles.note}>
            Снимок отчёта: {formatInstant(query.data.observedAt, zone)} {zone} (
            {utcOffsetLabel(new Date(query.data.observedAt), zone)}). Значения — абсолютные количества по истории
            Studio.
          </p>
        </Panel>
      ) : null}
      {query.isPending || (query.data && !accessDenied) ? (
        <Panel title="Сравнение">
          <div aria-busy={query.isPending}>
            <Tabs
              selectedKey={effectiveSearch.comparison}
              onSelectionChange={(key) => onSearchChange({ comparison: String(key) as AnalyticsSearch['comparison'] })}
            >
              <TabList aria-label="Измерение сравнения">
                <Tab id="destination">Каналы</Tab>
                <Tab id="media">Типы медиа</Tab>
              </TabList>
              <TabPanel id="destination">
                {query.data && !accessDenied ? (
                  <Comparison report={query.data} mode="destination" />
                ) : (
                  <Skeleton height={160} />
                )}
              </TabPanel>
              <TabPanel id="media">
                {query.data && !accessDenied ? (
                  <Comparison report={query.data} mode="media" />
                ) : (
                  <Skeleton height={160} />
                )}
              </TabPanel>
            </Tabs>
          </div>
        </Panel>
      ) : null}
      {query.data && !accessDenied ? (
        <>
          <Panel title="Публикации" footer={<span>Показано {rows.length}</span>}>
            <ReportTable
              report={query.data}
              zone={zone}
              onOpen={openRow}
              onClear={() => apply({ period: activePeriod, destinationId: 'all', mediaKind: 'all', outcome: 'all' })}
              registerRow={(id, node) => {
                if (node) rowRefs.current.set(id, node);
                else rowRefs.current.delete(id);
              }}
            />
          </Panel>
          {query.data.publications.nextCursor ? (
            <Button
              variant="secondary"
              onPress={() => onSearchChange({ cursor: query.data?.publications.nextCursor ?? undefined })}
            >
              Показать ещё
            </Button>
          ) : null}
        </>
      ) : null}
      <Drawer
        isOpen={detail !== null && !accessDenied}
        onOpenChange={(open) => {
          if (!open) onSearchChange({ publicationId: undefined });
        }}
        title={detail?.title || 'Публикация'}
      >
        {detail && !accessDenied ? (
          <dl className={styles.detail}>
            <div>
              <dt>Результат</dt>
              <dd>
                <StatusBadge status={OUTCOME_STATUS[detail.outcome]} />
              </dd>
            </div>
            <div>
              <dt>Снимок наблюдения</dt>
              <dd>
                {formatInstant(detail.observedAt, zone)} {zone}, {utcOffsetLabel(new Date(detail.observedAt), zone)}
              </dd>
            </div>
            <div>
              <dt>Канал</dt>
              <dd>{detail.destinationTitle ?? 'Канал недоступен'}</dd>
            </div>
            <div>
              <dt>Медиа</dt>
              <dd>
                {detail.mediaKinds === null
                  ? 'Не записано'
                  : detail.mediaKinds.length
                    ? detail.mediaKinds.map(mediaLabel).join(', ')
                    : 'Без медиа'}
              </dd>
            </div>
            <div>
              <dt>Попытки</dt>
              <dd>{detail.attemptCount}</dd>
            </div>
            <div>
              <dt>Повторные попытки</dt>
              <dd>{detail.retryCount}</dd>
            </div>
            {detail.outcome === 'unknown' ? (
              <>
                <p className={styles.note}>
                  Результат не подтверждён на момент снимка. Здесь нельзя повторить отправку или сверку.
                </p>
                <Button variant="secondary" onPress={() => onOpenPublication(detail.publicationId)}>
                  Открыть публикацию и проверку
                </Button>
              </>
            ) : (
              <Button variant="secondary" onPress={() => onOpenPublication(detail.publicationId)}>
                Открыть публикацию
              </Button>
            )}
          </dl>
        ) : null}
      </Drawer>
    </main>
  );
}
