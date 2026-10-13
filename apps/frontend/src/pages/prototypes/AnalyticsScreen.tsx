/* oxlint-disable react/set-state-in-effect -- prototype filters mirror the URL state switcher. */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AppliedChips,
  Button,
  Drawer,
  EmptyState,
  ErrorState,
  Panel,
  Select,
  Skeleton,
  StatusBadge,
  Tab,
  TabList,
  TabPanel,
  Tabs
} from '../../shared/ui';
import { PreviewPage } from './preview-kit';
import { useNarrow, useProtoNavigate, useProtoSearch, useProtoSearchUpdate } from './proto-kit';
import styles from './Analytics.module.css';

type Outcome = 'sent' | 'failed' | 'unknown';
type MediaKind = 'Фото' | 'Анимация' | 'Видео' | null;
type Entry = {
  id: string;
  publicationId: string;
  title: string;
  /** September day-of-month in the default report snapshot. */
  date: number;
  destination: string;
  outcome: Outcome;
  media: MediaKind;
  mediaRecorded: boolean;
  observedAt: string;
  attempts: number;
};

const titles = [
  'Как меняется карта после обновления: главные детали',
  'Итоги турнира и самые напряжённые моменты финала',
  'Новый герой: способности и первые впечатления',
  'Большое обновление уже доступно — что важно знать',
  'Расписание матчей на эту неделю',
  'Разбор патча: изменения предметов и баланса',
  'Команда объявила состав на следующий сезон',
  'Пять моментов, которые решили исход серии',
  'Коротко о главных новостях сообщества',
  'Финал завершился: результаты и статистика',
  'Что изменилось в рейтинговом режиме',
  'Подборка лучших игровых моментов недели'
];

const records: Entry[] = Array.from({ length: 42 }, (_, index) => ({
  id: `pub-${String(index + 1).padStart(2, '0')}`,
  publicationId: 'u4',
  title: titles[index % titles.length] ?? 'Публикация Studio',
  date: 30 - (index % 30),
  destination: index % 2 === 0 ? 'Канал А' : 'Канал Б',
  outcome: index < 38 ? 'sent' : index < 40 ? 'failed' : 'unknown',
  media: index % 5 === 0 ? null : (['Фото', 'Анимация', 'Видео'][index % 3] as MediaKind),
  mediaRecorded: index % 6 !== 0,
  observedAt: new Date(Date.UTC(2026, 8, 30 - (index % 30), 5 + (index % 8), (index * 7) % 60)).toISOString(),
  attempts: index === 3 || index === 11 || index === 22 || index === 31 || index === 36 ? 2 : 1
}));

const periods = [
  { id: '30', label: '1–30 сентября 2026' },
  { id: '7', label: '24–30 сентября 2026' },
  { id: '90', label: '1 июля – 30 сентября 2026' }
];
const destinations = [
  { id: 'all', label: 'Все каналы' },
  { id: 'Канал А', label: 'Канал А' },
  { id: 'Канал Б', label: 'Канал Б' }
];
const mediaTypes = [
  { id: 'all', label: 'Все типы медиа' },
  { id: 'Фото', label: 'Фото' },
  { id: 'Анимация', label: 'Анимация' },
  { id: 'Видео', label: 'Видео' }
];
const outcomes = [
  { id: 'all', label: 'Все результаты' },
  { id: 'sent', label: 'Отправлено' },
  { id: 'failed', label: 'Ошибка' },
  { id: 'unknown', label: 'Требует проверки' }
];
const comparisons = [
  { id: 'destination', label: 'Каналы' },
  { id: 'media', label: 'Типы медиа' }
];

type Filters = { period: string; destination: string; media: string; outcome: string };
const defaults: Filters = { period: '30', destination: 'all', media: 'all', outcome: 'all' };
const outcomeStatus: Record<Outcome, 'sent' | 'failed' | 'unknown'> = {
  sent: 'sent',
  failed: 'failed',
  unknown: 'unknown'
};

function optionValue(values: readonly { id: string }[], value: string | undefined, fallback: string) {
  return values.some((option) => option.id === value) ? (value ?? fallback) : fallback;
}

function formatObservedAt(value: string) {
  const instant = new Date(value);
  const display = new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Chisinau'
  }).format(instant);
  return `${display} Europe/Chisinau (UTC+3)`;
}

export function AnalyticsScreen() {
  const narrow = useNarrow();
  const search = useProtoSearch();
  const updateSearch = useProtoSearchUpdate();
  const navigate = useProtoNavigate();
  const [draft, setDraft] = useState<Filters>({
    period: optionValue(periods, search.period, defaults.period),
    destination: optionValue(destinations, search.destination, defaults.destination),
    media: optionValue(mediaTypes, search.media, defaults.media),
    outcome: optionValue(outcomes, search.outcome, defaults.outcome)
  });
  const [applied, setApplied] = useState(draft);
  const [comparison, setComparison] = useState(optionValue(comparisons, search.compare, 'destination'));
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());
  const previousDetailId = useRef<string | null>(null);
  const [filterSheet, setFilterSheet] = useState(false);
  const openRecord = records.find((record) => record.id === search.id) ?? null;
  const [loading, setLoading] = useState(search.state === 'loading');
  const [failedRead, setFailedRead] = useState(search.state === 'error');
  const [retrySucceeded, setRetrySucceeded] = useState(false);
  const state = search.state;
  const partial = state === 'partial';
  const currentPage = Math.max(1, Number.parseInt(search.page ?? '1', 10) || 1);
  const accessBlocked = state === 'unauthorized' || state === 'forbidden';
  const periodLabel = periods.find((period) => period.id === applied.period)?.label ?? periods[0]!.label;

  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'Аналитика публикаций — ALEXEEV Studio';
    return () => {
      document.title = previousTitle;
    };
  }, []);

  useEffect(() => {
    const next: Filters = {
      period: optionValue(periods, search.period, defaults.period),
      destination: optionValue(destinations, search.destination, defaults.destination),
      media: optionValue(mediaTypes, search.media, defaults.media),
      outcome: optionValue(outcomes, search.outcome, defaults.outcome)
    };
    setDraft(next);
    setApplied(next);
    setFailedRead(search.state === 'error');
    setLoading(search.state === 'loading');
  }, [search.destination, search.media, search.outcome, search.period, search.state]);

  useEffect(() => {
    setComparison(optionValue(comparisons, search.compare, 'destination'));
  }, [search.compare]);

  useEffect(() => {
    if (openRecord) {
      previousDetailId.current = openRecord.id;
      return;
    }
    const closedId = previousDetailId.current;
    if (!closedId) return;
    previousDetailId.current = null;
    const frame = window.requestAnimationFrame(() => rowRefs.current.get(closedId)?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [openRecord]);

  const matching = useMemo(
    () =>
      records.filter((record) => {
        if (applied.period === '7' && record.date < 24) return false;
        if (applied.destination !== 'all' && record.destination !== applied.destination) return false;
        if (applied.media !== 'all' && (!record.mediaRecorded || record.media !== applied.media)) return false;
        if (applied.outcome !== 'all' && record.outcome !== applied.outcome) return false;
        return true;
      }),
    [applied]
  );
  const sent = matching.filter((item) => item.outcome === 'sent').length;
  const errors = matching.filter((item) => item.outcome === 'failed').length;
  const unknown = matching.filter((item) => item.outcome === 'unknown').length;
  const mediaUnrecorded = matching.filter((item) => !item.mediaRecorded).length;
  const totalAttempts = matching.reduce((sum, item) => sum + item.attempts, 0);
  const retriedPublications = matching.filter((item) => item.attempts > 1).length;

  const apply = (next: Filters) => {
    setApplied(next);
    setDraft(next);
    setLoading(true);
    setFailedRead(false);
    setFilterSheet(false);
    updateSearch(
      {
        period: next.period,
        destination: next.destination === 'all' ? undefined : next.destination,
        media: next.media === 'all' ? undefined : next.media,
        outcome: next.outcome === 'all' ? undefined : next.outcome,
        compare: comparison,
        page: undefined,
        id: undefined,
        state: undefined
      },
      false
    );
    window.setTimeout(() => setLoading(false), 350);
  };
  const retry = () => {
    setFailedRead(false);
    setRetrySucceeded(false);
    setLoading(true);
    window.setTimeout(() => {
      setLoading(false);
      setRetrySucceeded(true);
      updateSearch({ state: undefined });
    }, 350);
  };
  const clear = () => apply(defaults);
  const filterCount = Object.entries(draft).filter(([key, value]) => key !== 'period' && value !== 'all').length;
  const appliedChips = [
    applied.destination !== 'all' ? { id: 'destination', label: `Канал: ${applied.destination}` } : null,
    applied.media !== 'all' ? { id: 'media', label: `Медиа: ${applied.media}` } : null,
    applied.outcome !== 'all'
      ? {
          id: 'outcome',
          label: `Результат: ${outcomes.find((item) => item.id === applied.outcome)?.label ?? applied.outcome}`
        }
      : null
  ].filter((chip): chip is { id: string; label: string } => chip !== null);
  const removeChip = (id: string) => apply({ ...applied, [id]: 'all' });

  const filterFields = (
    <>
      <Select
        label="Период"
        options={periods}
        value={draft.period}
        onChange={(value) => setDraft({ ...draft, period: value })}
      />
      <Select
        label="Канал"
        options={destinations}
        value={draft.destination}
        onChange={(value) => setDraft({ ...draft, destination: value })}
      />
      <Select
        label="Медиа"
        options={mediaTypes}
        value={draft.media}
        onChange={(value) => setDraft({ ...draft, media: value })}
      />
      <Select
        label="Результат"
        options={outcomes}
        value={draft.outcome}
        onChange={(value) => setDraft({ ...draft, outcome: value })}
      />
    </>
  );
  const filterControls = (
    <div className={styles.filters}>
      {filterFields}
      <Button onPress={() => apply(draft)}>Применить</Button>
    </div>
  );

  const comparisonRows = (() => {
    const key = comparison;
    const values =
      key === 'destination' ? ['Канал А', 'Канал Б'] : ['Фото', 'Анимация', 'Видео', 'Без медиа', 'Не записано'];
    const getDimension = (record: Entry) =>
      key === 'destination' ? record.destination : record.mediaRecorded ? (record.media ?? 'Без медиа') : 'Не записано';
    return values
      .map((value) => {
        const rows = matching.filter((record) => getDimension(record) === value);
        const rowSent = rows.filter((record) => record.outcome === 'sent').length;
        const rowErrors = rows.filter((record) => record.outcome === 'failed').length;
        const rowUnknown = rows.filter((record) => record.outcome === 'unknown').length;
        const covered = rows.filter((record) => (key === 'media' ? record.mediaRecorded : true)).length;
        return { value, total: rows.length, sent: rowSent, errors: rowErrors, unknown: rowUnknown, covered };
      })
      .filter((row) => row.total > 0 || partial);
  })();

  const visibleRecords = matching.slice(0, currentPage * 10);
  const hasOptionalFilters = applied.destination !== 'all' || applied.media !== 'all' || applied.outcome !== 'all';
  const empty = state === 'empty' || (matching.length === 0 && !failedRead && !loading);
  const activePeriod = applied.period === '7' ? 7 : applied.period === '30' ? 30 : 90;

  return (
    <PreviewPage title="Аналитика публикаций" focusHeadingOnMount>
      <section className={styles.toolbar} aria-label="Фильтры отчёта">
        {narrow ? (
          <>
            <p className={styles.periodNote}>Период: {periodLabel} · Europe/Chisinau (UTC+3)</p>
            <Button
              variant="secondary"
              id="analytics-filter-trigger"
              onPress={() => {
                setFilterSheet(true);
              }}
            >
              Фильтры ({filterCount})
            </Button>
          </>
        ) : (
          filterControls
        )}
      </section>
      <AppliedChips chips={appliedChips} onRemove={removeChip} />

      {filterSheet ? (
        <Drawer
          variant="bottom"
          isOpen
          onOpenChange={(open) => {
            setFilterSheet(open);
            if (!open) window.requestAnimationFrame(() => document.getElementById('analytics-filter-trigger')?.focus());
          }}
          title={`Фильтры (${filterCount})`}
          footer={
            <div className={styles.sheetActions}>
              <Button variant="secondary" onPress={() => setDraft({ ...defaults, period: applied.period })}>
                Сбросить
              </Button>
              <Button onPress={() => apply(draft)}>Показать результаты</Button>
            </div>
          }
        >
          <div className={styles.sheetFields}>
            <div className={styles.filters}>{filterFields}</div>
          </div>
        </Drawer>
      ) : null}

      {state === 'unauthorized' ? (
        <Panel title="Сессия завершена" marker={<span className={styles.demo}>демо</span>}>
          <ErrorState
            title="Войдите снова, чтобы открыть аналитику"
            message="Демо-сессия завершилась. Данные отчёта не загружены."
            action={<Button onPress={() => navigate('login')}>Перейти ко входу</Button>}
          />
        </Panel>
      ) : state === 'forbidden' ? (
        <Panel title="Доступ ограничен" marker={<span className={styles.demo}>демо</span>}>
          <ErrorState
            title="Нет доступа к аналитике"
            message="Для этой демо-учётной записи отчёт недоступен. Данные не загружены."
            action={
              <Button variant="secondary" onPress={() => navigate('')}>
                Назад к обзору
              </Button>
            }
          />
        </Panel>
      ) : loading ? (
        <section className={styles.loading} aria-busy="true" aria-label="Загрузка отчёта">
          <Skeleton height={20} width="45%" />
          <div className={styles.summary}>
            <Skeleton height={110} />
            <Skeleton height={110} />
            <Skeleton height={110} />
          </div>
          <Skeleton height={250} />
        </section>
      ) : failedRead ? (
        <Panel title="Отчёт недоступен" marker={<span className={styles.demo}>демо</span>}>
          <ErrorState
            title="Не удалось загрузить аналитику"
            message="Демо-запрос завершился ошибкой. Код запроса: DEMO-AN-503."
            onRetry={retry}
          />
        </Panel>
      ) : empty ? (
        <Panel title="Публикации" marker={<span className={styles.demo}>демо</span>}>
          <EmptyState
            icon="search"
            title="Нет наблюдений по выбранному периоду и фильтрам"
            description="Попробуйте изменить период или очистить необязательные фильтры."
            action={
              <Button variant="secondary" onPress={clear}>
                {hasOptionalFilters ? 'Сбросить фильтры' : 'Выбрать другой период'}
              </Button>
            }
          />
        </Panel>
      ) : (
        <>
          <Panel title="Результаты периода" marker={<span className={styles.demo}>демо</span>}>
            <div className={styles.reportCaption}>
              <span>{periodLabel} · Europe/Chisinau (UTC+3)</span>
              <span>Снимок отчёта: 12 окт. 2026, 09:14 Europe/Chisinau (UTC+3)</span>
            </div>
            <div className={styles.summary}>
              <div>
                <strong>{sent}</strong>
                <span>Отправлено</span>
              </div>
              <div>
                <strong>{errors}</strong>
                <span>Ошибки</span>
              </div>
              <div>
                <strong>{unknown}</strong>
                <span>Требуют проверки</span>
              </div>
              <div>
                <strong>{totalAttempts}</strong>
                <span>Попытки отправки</span>
              </div>
              <div>
                <strong>{retriedPublications}</strong>
                <span>Публикации с повторной попыткой</span>
              </div>
            </div>
            <p className={styles.note}>
              Неизвестный результат показан отдельно. В работе не включены в завершённые исходы.
            </p>
            {activePeriod < 30 ? (
              <p className={styles.note}>Показан ограниченный период: {activePeriod} дней.</p>
            ) : null}
            <p className={styles.note}>
              Рубрика не фиксируется в истории Studio и недоступна для фильтрации и сравнения.
            </p>
            {mediaUnrecorded > 0 ? (
              <output className={styles.coverage}>
                Медиа записано для {matching.length - mediaUnrecorded} из {matching.length} публикаций; для{' '}
                {mediaUnrecorded} значение не записано. Отсутствующие значения не равны нулю.
              </output>
            ) : null}
          </Panel>

          <Panel title="Сравнение" marker={<span className={styles.demo}>демо</span>}>
            <Tabs
              selectedKey={comparison}
              onSelectionChange={(key) => {
                const next = String(key);
                setComparison(next);
                updateSearch({ compare: next }, false);
              }}
            >
              <TabList aria-label="Сравнить по">
                {comparisons.map((item) => (
                  <Tab key={item.id} id={item.id}>
                    {item.label}
                  </Tab>
                ))}
              </TabList>
              <TabPanel id={comparison}>
                {partial && comparison !== 'destination' ? (
                  <p className={styles.coverage}>
                    Часть исторических значений не записана. Отсутствующие значения не считаются нулём.
                  </p>
                ) : null}
                <div className={styles.tableWrap}>
                  <table className={styles.table} data-kind="comparison">
                    <caption className={styles.srOnly}>
                      Сравнение публикаций по {comparisons.find((item) => item.id === comparison)?.label.toLowerCase()}
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">{comparison === 'destination' ? 'Канал' : 'Тип медиа'}</th>
                        <th scope="col">Учтено</th>
                        <th scope="col">Отправлено</th>
                        <th scope="col">Ошибки</th>
                        <th scope="col">Требуют проверки</th>
                        <th scope="col">Покрытие</th>
                      </tr>
                    </thead>
                    <tbody>
                      {comparisonRows.map((row) => (
                        <tr key={row.value}>
                          <th scope="row">{row.value}</th>
                          <td>{row.total}</td>
                          <td>{row.sent}</td>
                          <td>{row.errors}</td>
                          <td>{row.unknown}</td>
                          <td>
                            {comparison === 'destination'
                              ? `${row.total} записано`
                              : `${row.covered} из ${row.total} записано`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className={styles.note}>Описательное сравнение, не рейтинг и не оценка причин.</p>
              </TabPanel>
            </Tabs>
          </Panel>

          <Panel title={`Публикации (${matching.length})`} marker={<span className={styles.demo}>демо</span>}>
            <div className={styles.tableWrap}>
              <table className={styles.table} data-kind="publications">
                <caption className={styles.srOnly}>Публикации за {periodLabel}</caption>
                <thead>
                  <tr>
                    <th scope="col">Публикация</th>
                    <th scope="col">Результат</th>
                    <th scope="col">Наблюдалось</th>
                    <th scope="col">Попытки</th>
                    <th scope="col">Повторные</th>
                    <th scope="col">Назначение</th>
                    <th scope="col">Медиа</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRecords.map((record) => (
                    <tr key={record.id}>
                      <th scope="row">
                        <button
                          type="button"
                          aria-label={`Открыть публикацию: ${record.title}`}
                          className={styles.rowButton}
                          ref={(element) => {
                            if (element) rowRefs.current.set(record.id, element);
                            else rowRefs.current.delete(record.id);
                          }}
                          onClick={() => updateSearch({ id: record.id }, false)}
                        >
                          <span className={styles.title}>{record.title}</span>
                          <small>{record.id}</small>
                        </button>
                      </th>
                      <td>
                        <StatusBadge status={outcomeStatus[record.outcome]} />
                      </td>
                      <td>{formatObservedAt(record.observedAt)}</td>
                      <td>{record.attempts}</td>
                      <td>{record.attempts > 1 ? 'Да' : 'Нет'}</td>
                      <td>{record.destination}</td>
                      <td>{record.mediaRecorded ? (record.media ?? 'Без медиа') : 'Не записано'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className={styles.footer}>
              Показано {visibleRecords.length} из {matching.length} · сохранённый снимок: {periodLabel} · источник:
              история Studio
            </p>
            {visibleRecords.length < matching.length ? (
              <Button variant="secondary" onPress={() => updateSearch({ page: String(currentPage + 1) }, false)}>
                Показать ещё
              </Button>
            ) : null}
          </Panel>
        </>
      )}
      {!accessBlocked && state === 'unknown' ? (
        <Panel title="Неизвестный исход" marker={<span className={styles.demo}>демо</span>}>
          <p className={styles.coverage}>
            Отправка могла состояться, но подтверждения нет. Статус остаётся «Требует проверки» и не считается успехом.
            Аналитика не предлагает повтор или сверку.
          </p>
        </Panel>
      ) : null}
      {retrySucceeded ? <output className={styles.retryStatus}>Демо-отчёт обновлён. Снимок не изменён.</output> : null}
      <Drawer
        isOpen={openRecord !== null}
        onOpenChange={(open) => !open && updateSearch({ id: undefined })}
        title={openRecord?.title ?? 'Публикация'}
      >
        {openRecord ? (
          <dl className={styles.detail}>
            <div>
              <dt>Результат</dt>
              <dd>
                <StatusBadge status={outcomeStatus[openRecord.outcome]} />
              </dd>
            </div>
            <div>
              <dt>Снимок наблюдения</dt>
              <dd>{formatObservedAt(openRecord.observedAt)}</dd>
            </div>
            <div>
              <dt>Назначение</dt>
              <dd>{openRecord.destination}</dd>
            </div>
            <div>
              <dt>Медиа</dt>
              <dd>{openRecord.mediaRecorded ? (openRecord.media ?? 'Без медиа') : 'Не записано'}</dd>
            </div>
            <div>
              <dt>Попытки</dt>
              <dd>{openRecord.attempts}</dd>
            </div>
            <div>
              <dt>Повторная попытка</dt>
              <dd>{openRecord.attempts > 1 ? 'Да' : 'Нет'}</dd>
            </div>
            {openRecord.outcome === 'unknown' ? (
              <div>
                <p className={styles.coverage}>
                  Исход не подтверждён. Эта демо-страница только показывает запись; сверка и повтор недоступны здесь.
                </p>
                <Button variant="secondary" onPress={() => navigate('publications', { id: openRecord.publicationId })}>
                  Открыть публикацию и проверку
                </Button>
              </div>
            ) : null}
          </dl>
        ) : null}
      </Drawer>
    </PreviewPage>
  );
}
