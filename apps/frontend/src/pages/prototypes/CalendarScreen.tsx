import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  ConfirmDialog,
  Dialog,
  Drawer,
  EmptyState,
  ErrorState,
  Icon,
  IconButton,
  Menu,
  Panel,
  RowCard,
  SegmentedControl,
  Select,
  Skeleton,
  StatusBadge,
  statusMeta,
  type MenuEntry
} from '../../shared/ui';
import { NOW } from './data';
import {
  CALENDAR_ITEMS,
  MONTH_GEN,
  MONTH_NAMES,
  monthShort,
  TODAY_KEY,
  WEEKDAYS,
  WEEKDAYS_LONG,
  addDays,
  addMonths,
  atLocal,
  dateOfKey,
  dayKeyOf,
  dayNumber,
  hourOf,
  keyOfDate,
  longDay,
  monthOfKey,
  startOfWeek,
  timeOf,
  weekdayOf,
  type CalendarItem
} from './preview-data';
import { PreviewPage, Thumb, usePreviewToast } from './preview-kit';
import { PublishDialog, ZONE } from './PublishDialog';
import { useNarrow, useProtoNavigate, useProtoSearch, useProtoSearchUpdate, useScreenPhase } from './proto-kit';
import styles from './Calendar.module.css';
import kit from './Preview.module.css';

type View = 'month' | 'week' | 'day' | 'list';
const VIEWS: readonly View[] = ['month', 'week', 'day', 'list'];
const MAX_IN_CELL = 3;

const monthLabel = (key: string) => `${MONTH_NAMES[monthOfKey(key)]} ${dateOfKey(key).getUTCFullYear()}`;
const weekLabel = (key: string) => {
  const start = startOfWeek(key);
  const end = addDays(start, 6);
  return `${dayNumber(start)} ${monthOfKey(start) === monthOfKey(end) ? '' : `${monthShort(monthOfKey(start))}. `}– ${dayNumber(end)} ${MONTH_GEN[monthOfKey(end)] ?? ''}`;
};
const dayLabel = (key: string) => `${longDay(key)}, ${WEEKDAYS_LONG[weekdayOf(key)]}`;

/** Status marker: icon plus colour from the status group; the text label sits in the aria-label and the inspector. */
function StatusMark({ item }: { item: CalendarItem }) {
  const meta = statusMeta(item.status);
  return (
    <span className={styles.mark} style={{ color: `var(--color-status-${meta.group}-fg)` }} aria-hidden="true">
      <Icon name={meta.icon} size={13} />
    </span>
  );
}

const itemLabel = (item: CalendarItem) => `${timeOf(item.at)}, ${item.title}, ${statusMeta(item.status).label}`;

function useCollisions(items: readonly CalendarItem[]) {
  return useMemo(() => {
    const counts = new Map<number, number>();
    for (const item of items) counts.set(item.at, (counts.get(item.at) ?? 0) + 1);
    return (item: CalendarItem) => counts.get(item.at) ?? 1;
  }, [items]);
}

type Actions = {
  open: (item: CalendarItem) => void;
  move: (item: CalendarItem) => void;
  cancel: (item: CalendarItem) => void;
  check: () => void;
};

/** An `unknown` item may only be checked (rule 2.5); only a scheduled one may move or be cancelled. */
function entriesOf(item: CalendarItem): MenuEntry[] {
  if (item.status === 'unknown') return [{ id: 'check', label: 'Проверить', icon: 'search' }];
  if (item.status === 'scheduled')
    return [
      { id: 'open', label: 'Открыть', icon: 'link' },
      { id: 'move', label: 'Перенести', icon: 'clock' },
      { id: 'cancel', label: 'Отменить публикацию', icon: 'x-circle', tone: 'danger' }
    ];
  return [{ id: 'open', label: 'Открыть', icon: 'link' }];
}

function ItemMenu({ item, actions }: { item: CalendarItem; actions: Actions }) {
  return (
    <Menu
      label={`Действия: ${item.title}`}
      items={entriesOf(item)}
      onAction={(id) => {
        if (id === 'open') actions.open(item);
        else if (id === 'move') actions.move(item);
        else if (id === 'cancel') actions.cancel(item);
        else actions.check();
      }}
    />
  );
}

function CollisionChip({ count }: { count: number }) {
  if (count < 2) return null;
  return (
    <span className={styles.collision}>
      <Icon name="alert" size={12} />
      {count} в одно время
    </span>
  );
}

function ItemDetail({ item, actions, collisions }: { item: CalendarItem; actions: Actions; collisions: number }) {
  return (
    <div className={styles.detail}>
      <div className={styles.detailHead}>
        <Thumb seed={item.title} size={44} label={item.thumb ? 'img' : 'txt'} />
        <div className={styles.detailTitle}>
          <strong>{item.title}</strong>
          <span className={kit.muted}>
            {longDay(dayKeyOf(item.at))}, {timeOf(item.at)} · {item.channel}
          </span>
        </div>
      </div>
      <div className={kit.inlineRow}>
        <StatusBadge status={item.status} />
        <CollisionChip count={collisions} />
      </div>
      {item.status === 'unknown' ? (
        <p className={styles.warn}>
          <Icon name="alert" size={14} /> Telegram не подтвердил отправку. Повторять нельзя, пока канал не проверен.
        </p>
      ) : null}
      <div className={kit.inlineRow}>
        {item.status === 'unknown' ? (
          <Button size="sm" onPress={actions.check}>
            Проверить
          </Button>
        ) : (
          <Button size="sm" variant="secondary" onPress={() => actions.open(item)}>
            Открыть
          </Button>
        )}
        {item.status === 'scheduled' ? (
          <>
            <Button size="sm" variant="secondary" onPress={() => actions.move(item)}>
              Перенести
            </Button>
            <Button size="sm" variant="ghost" onPress={() => actions.cancel(item)}>
              Отменить
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
}

type GridProps = {
  date: string;
  byDay: Map<string, CalendarItem[]>;
  loading: boolean;
  selectedId: string | undefined;
  collide: (item: CalendarItem) => number;
  onDay: (key: string) => void;
  onItem: (item: CalendarItem) => void;
};

function Chip({
  item,
  selected,
  onItem,
  collide
}: Pick<GridProps, 'collide' | 'onItem'> & { item: CalendarItem; selected: boolean }) {
  return (
    <button
      type="button"
      className={styles.chip}
      data-selected={selected || undefined}
      title={item.title}
      aria-label={itemLabel(item)}
      onClick={() => onItem(item)}
    >
      <StatusMark item={item} />
      <span className={kit.mono}>{timeOf(item.at)}</span>
      <span className={styles.chipTitle}>{item.title}</span>
      {collide(item) > 1 ? <Icon name="alert" size={12} /> : null}
    </button>
  );
}

function MonthGrid(props: GridProps) {
  const { date, byDay, loading, selectedId, collide, onDay, onItem } = props;
  const first = `${date.slice(0, 8)}01`;
  const start = startOfWeek(first);
  const days = Array.from({ length: 42 }, (_, index) => addDays(start, index));
  const month = monthOfKey(date);
  return (
    <div className={styles.month} aria-busy={loading || undefined}>
      <div className={styles.weekHead} aria-hidden="true">
        {WEEKDAYS.map((name) => (
          <span key={name}>{name}</span>
        ))}
      </div>
      <div className={styles.monthBody}>
        {days.map((key) => {
          const items = loading ? [] : (byDay.get(key) ?? []);
          const shown = items.slice(0, MAX_IN_CELL);
          return (
            <div
              key={key}
              className={styles.cell}
              data-outside={monthOfKey(key) !== month || undefined}
              data-selected={key === date || undefined}
              data-today={key === TODAY_KEY || undefined}
            >
              <button
                type="button"
                className={styles.cellHit}
                aria-label={`${longDay(key)}${items.length ? `, публикаций: ${items.length}` : ', пусто'}`}
                aria-pressed={key === date}
                onClick={() => onDay(key)}
              />
              <span className={styles.cellHead}>
                <span className={styles.dayNo}>{dayNumber(key)}</span>
                {key === TODAY_KEY ? <span className={styles.todayTag}>Сегодня</span> : null}
              </span>
              {loading ? (
                <>
                  <Skeleton height={18} width="90%" />
                  {dayNumber(key) % 3 === 0 ? <Skeleton height={18} width="70%" /> : null}
                </>
              ) : (
                <>
                  {shown.map((item) => (
                    <Chip
                      key={item.id}
                      item={item}
                      selected={item.id === selectedId}
                      onItem={onItem}
                      collide={collide}
                    />
                  ))}
                  {items.length > MAX_IN_CELL ? (
                    <button type="button" className={styles.more} onClick={() => onDay(key)}>
                      ещё {items.length - MAX_IN_CELL}
                    </button>
                  ) : null}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HourGrid({ days, ...props }: GridProps & { days: string[] }) {
  const { byDay, loading, selectedId, collide, onDay, onItem } = props;
  const scroller = useRef<HTMLDivElement>(null);
  // Open at the working day, not at midnight.
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = 8 * 48;
  }, []);
  return (
    <div className={styles.hours} ref={scroller} aria-busy={loading || undefined}>
      <div className={styles.hoursHead} style={{ gridTemplateColumns: `56px repeat(${days.length}, minmax(0, 1fr))` }}>
        <span />
        {days.map((key) => (
          <button
            type="button"
            key={key}
            className={styles.hoursDay}
            data-today={key === TODAY_KEY || undefined}
            data-selected={key === props.date || undefined}
            onClick={() => onDay(key)}
          >
            <span>{WEEKDAYS[weekdayOf(key)]}</span>
            <strong>{dayNumber(key)}</strong>
            {key === TODAY_KEY ? <span className={styles.todayTag}>Сегодня</span> : null}
          </button>
        ))}
      </div>
      {Array.from({ length: 24 }, (_, hour) => (
        <div
          key={hour}
          className={styles.hourRow}
          style={{ gridTemplateColumns: `56px repeat(${days.length}, minmax(0, 1fr))` }}
        >
          <span className={`${kit.mono} ${styles.hourLabel}`}>{String(hour).padStart(2, '0')}:00</span>
          {days.map((key) => {
            const items = loading ? [] : (byDay.get(key) ?? []).filter((item) => hourOf(item.at) === hour);
            return (
              <div key={key} className={styles.hourCell}>
                {loading && hour >= 9 && hour <= 20 && dayNumber(key) % 2 === hour % 2 ? (
                  <Skeleton height={20} width="80%" />
                ) : null}
                {items.map((item) => (
                  <Chip key={item.id} item={item} selected={item.id === selectedId} onItem={onItem} collide={collide} />
                ))}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function ListView({
  items,
  loading,
  selectedId,
  collide,
  onItem
}: {
  items: CalendarItem[];
  loading: boolean;
  selectedId: string | undefined;
  collide: (item: CalendarItem) => number;
  onItem: (item: CalendarItem) => void;
}) {
  const narrow = useNarrow();
  if (loading) {
    return (
      <div className={styles.list} aria-busy="true">
        {Array.from({ length: 8 }, (_, index) => (
          <div key={index} className={styles.listRow}>
            <Skeleton height={14} width={narrow ? '30%' : '60%'} />
            <Skeleton height={14} width="70%" />
          </div>
        ))}
      </div>
    );
  }
  const groups = new Map<string, CalendarItem[]>();
  for (const item of items) {
    const key = dayKeyOf(item.at);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return (
    <div className={styles.list}>
      {[...groups].map(([key, group]) => (
        <section key={key} aria-label={dayLabel(key)}>
          <h3 className={styles.listDay}>
            {dayLabel(key)}
            {key === TODAY_KEY ? <span className={styles.todayTag}>Сегодня</span> : null}
          </h3>
          {group.map((item) => (
            <button
              type="button"
              key={item.id}
              className={styles.listRow}
              data-selected={item.id === selectedId || undefined}
              onClick={() => onItem(item)}
              aria-label={itemLabel(item)}
            >
              <span className={`${kit.mono} ${kit.nowrap}`}>{timeOf(item.at)}</span>
              <span className={styles.listTitle}>
                <Thumb seed={item.title} size={24} label={item.thumb ? 'img' : ''} />
                <span className={styles.chipTitle} title={item.title}>
                  {item.title}
                </span>
                <CollisionChip count={collide(item)} />
              </span>
              <span className={kit.muted}>{item.channel}</span>
              <StatusBadge status={item.status} />
            </button>
          ))}
        </section>
      ))}
    </div>
  );
}

/** Phone: a compact month or week strip; the days with items carry dots (shape, plus a count in the label). */
function Strip({
  date,
  days,
  byDay,
  onDay
}: {
  date: string;
  days: string[];
  byDay: Map<string, CalendarItem[]>;
  onDay: (key: string) => void;
}) {
  const month = monthOfKey(date);
  return (
    <div className={styles.strip}>
      <div className={styles.stripHead} aria-hidden="true">
        {WEEKDAYS.map((name) => (
          <span key={name}>{name}</span>
        ))}
      </div>
      <div className={styles.stripBody}>
        {days.map((key) => {
          const count = byDay.get(key)?.length ?? 0;
          return (
            <button
              type="button"
              key={key}
              className={styles.stripDay}
              data-selected={key === date || undefined}
              data-today={key === TODAY_KEY || undefined}
              data-outside={(days.length > 7 && monthOfKey(key) !== month) || undefined}
              aria-pressed={key === date}
              aria-label={`${longDay(key)}${count ? `, публикаций: ${count}` : ''}${key === TODAY_KEY ? ', сегодня' : ''}`}
              onClick={() => onDay(key)}
            >
              <span>{dayNumber(key)}</span>
              <span className={styles.dots} aria-hidden="true">
                {Array.from({ length: Math.min(count, 3) }, (_, index) => (
                  <i key={index} />
                ))}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Agenda({
  keys,
  byDay,
  loading,
  selectedId,
  collide,
  onItem,
  onPublish
}: {
  keys: string[];
  byDay: Map<string, CalendarItem[]>;
  loading: boolean;
  selectedId: string | undefined;
  collide: (item: CalendarItem) => number;
  onItem: (item: CalendarItem) => void;
  onPublish: () => void;
}) {
  if (loading) {
    return (
      <div aria-busy="true">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className={styles.agendaSkeleton}>
            <Skeleton height={16} width={index % 2 ? '58%' : '72%'} />
            <Skeleton height={12} width="44%" />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div>
      {keys.map((key) => {
        const items = byDay.get(key) ?? [];
        return (
          <section key={key} aria-label={dayLabel(key)}>
            <h3 className={styles.listDay}>
              {dayLabel(key)}
              {key === TODAY_KEY ? <span className={styles.todayTag}>Сегодня</span> : null}
            </h3>
            {items.length === 0 ? (
              <div className={styles.agendaEmpty}>
                <span className={kit.muted}>Нет публикаций</span>
                {keys.length === 1 ? (
                  <Button size="sm" variant="secondary" icon="send" onPress={onPublish}>
                    Опубликовать пост
                  </Button>
                ) : null}
              </div>
            ) : (
              <ul className={styles.agenda}>
                {items.map((item) => (
                  <RowCard
                    key={item.id}
                    title={item.title}
                    status={<StatusBadge status={item.status} />}
                    meta={
                      <span>
                        {timeOf(item.at)} · {item.channel}
                        {collide(item) > 1 ? ` · ${collide(item)} в одно время` : ''}
                      </span>
                    }
                    {...(item.status === 'unknown' ? { warning: 'Проверьте канал' } : {})}
                    isActive={item.id === selectedId}
                    onPress={() => onItem(item)}
                  />
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

export function CalendarScreen() {
  const narrow = useNarrow();
  const { phase, retry } = useScreenPhase();
  const search = useProtoSearch();
  const update = useProtoSearchUpdate();
  const go = useProtoNavigate();
  const preview = usePreviewToast();
  const requested = VIEWS.find((view) => view === search.view);
  const view: View = requested ?? (narrow ? 'day' : 'month');
  const date = search.date && /^\d{4}-\d{2}-\d{2}$/.test(search.date) ? search.date : TODAY_KEY;
  const [publishOpen, setPublishOpen] = useState(false);
  const [moveItem, setMoveItem] = useState<CalendarItem | null>(null);
  const [moveTo, setMoveTo] = useState('plus-1d');
  const [cancelItem, setCancelItem] = useState<CalendarItem | null>(null);

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    for (const item of [...CALENDAR_ITEMS].sort((a, b) => a.at - b.at)) {
      const key = dayKeyOf(item.at);
      map.set(key, [...(map.get(key) ?? []), item]);
    }
    return map;
  }, []);
  const collide = useCollisions(CALENDAR_ITEMS);
  const inMonth = CALENDAR_ITEMS.filter((item) => dayKeyOf(item.at).slice(0, 7) === date.slice(0, 7));
  const monthEmpty = phase === 'empty' || inMonth.length === 0;
  const loading = phase === 'loading';
  const selected = CALENDAR_ITEMS.find((item) => item.id === search.id);
  const selectedId = selected?.id;
  const dayItems = byDay.get(date) ?? [];
  const upcoming = CALENDAR_ITEMS.filter((item) => item.at >= NOW && item.status === 'scheduled')
    .sort((a, b) => a.at - b.at)
    .slice(0, 5);

  const setDate = (key: string) => update({ date: key === TODAY_KEY ? undefined : key, id: undefined });
  const step = (direction: 1 | -1) => {
    if (view === 'month' || view === 'list') setDate(addMonths(date, direction));
    else if (view === 'week') setDate(addDays(date, 7 * direction));
    else setDate(addDays(date, direction));
  };
  const actions: Actions = {
    open: () => go('publications'),
    move: (item) => {
      setMoveTo('plus-1d');
      setMoveItem(item);
    },
    cancel: setCancelItem,
    check: () => go('publications', { view: 'errors', id: 'u4' })
  };
  const selectItem = (item: CalendarItem) => update({ id: item.id, date: dayKeyOf(item.at) }, false);

  const weekDays = Array.from({ length: 7 }, (_, index) => addDays(startOfWeek(date), index));
  const monthDays = Array.from({ length: 42 }, (_, index) => addDays(startOfWeek(`${date.slice(0, 8)}01`), index));
  const title = view === 'week' ? weekLabel(date) : view === 'day' ? dayLabel(date) : monthLabel(date);

  const gridProps: GridProps = { date, byDay, loading, selectedId, collide, onDay: setDate, onItem: selectItem };
  const label = view === 'month' || view === 'list' ? 'месяц' : view === 'week' ? 'неделю' : 'день';

  let body;
  if (phase === 'error') {
    body = (
      <div className={styles.errorBox}>
        <ErrorState
          message="Не удалось загрузить календарь. Данные в Telegram не затронуты."
          requestId="req_c4a1f90e"
          onRetry={retry}
        />
      </div>
    );
  } else if (monthEmpty && !loading) {
    body = (
      <div className={styles.errorBox}>
        <EmptyState
          icon="calendar"
          title="В этом месяце ничего не запланировано"
          description="Опубликуйте пост сейчас или выберите дату в расписании."
          action={
            <Button icon="send" onPress={() => setPublishOpen(true)}>
              Опубликовать пост
            </Button>
          }
        />
      </div>
    );
  } else if (view === 'list') {
    body = (
      <ListView
        items={inMonth.sort((a, b) => a.at - b.at)}
        loading={loading}
        selectedId={selectedId}
        collide={collide}
        onItem={selectItem}
      />
    );
  } else if (narrow) {
    const strip = view === 'month' ? monthDays : weekDays;
    body =
      view === 'week' ? (
        <>
          <Strip date={date} days={weekDays} byDay={byDay} onDay={setDate} />
          <Agenda
            keys={weekDays}
            byDay={byDay}
            loading={loading}
            selectedId={selectedId}
            collide={collide}
            onItem={selectItem}
            onPublish={() => setPublishOpen(true)}
          />
        </>
      ) : (
        <>
          <Strip date={date} days={strip} byDay={byDay} onDay={setDate} />
          <Agenda
            keys={[date]}
            byDay={byDay}
            loading={loading}
            selectedId={selectedId}
            collide={collide}
            onItem={selectItem}
            onPublish={() => setPublishOpen(true)}
          />
        </>
      );
  } else if (view === 'month') {
    body = <MonthGrid {...gridProps} />;
  } else if (view === 'week') {
    body = <HourGrid {...gridProps} days={weekDays} />;
  } else {
    body = <HourGrid {...gridProps} days={[date]} />;
  }

  const nav = (
    <div className={styles.nav}>
      <IconButton
        label={`Предыдущий ${label === 'месяц' ? 'месяц' : label === 'неделю' ? 'период' : 'день'}`}
        icon="chevron-left"
        onPress={() => step(-1)}
      />
      <IconButton
        label={`Следующий ${label === 'месяц' ? 'месяц' : label === 'неделю' ? 'период' : 'день'}`}
        icon="chevron-right"
        onPress={() => step(1)}
      />
      <Button variant="secondary" size="sm" onPress={() => setDate(TODAY_KEY)}>
        Сегодня
      </Button>
    </div>
  );

  const moveOptions = moveItem
    ? [
        { id: 'plus-1h', label: `Через час · ${timeOf(moveItem.at + 3_600_000)}`, at: moveItem.at + 3_600_000 },
        { id: 'plus-1d', label: `Завтра · ${timeOf(moveItem.at)}`, at: moveItem.at + 86_400_000 },
        {
          id: 'next-mon',
          label: 'Понедельник · 10:00',
          at: atLocal(addDays(startOfWeek(dayKeyOf(moveItem.at)), 7), '10:00')
        }
      ]
    : [];
  const target = moveOptions.find((option) => option.id === moveTo);

  const inspector = (
    <Panel
      title={narrow ? 'Выбрано' : `День · ${longDay(date)}`}
      note={dayItems.length ? `${dayItems.length}` : undefined}
      footer={
        <span>
          {ZONE}, UTC+3 · сегодня {longDay(TODAY_KEY)}
        </span>
      }
    >
      <div className={styles.inspector}>
        {selected ? <ItemDetail item={selected} actions={actions} collisions={collide(selected)} /> : null}
        {dayItems.length === 0 ? (
          <div className={styles.emptyDay}>
            <p>Нет публикаций</p>
            <Button size="sm" icon="send" onPress={() => setPublishOpen(true)}>
              Опубликовать пост
            </Button>
          </div>
        ) : (
          <ul className={styles.dayList} aria-label={`Публикации на ${longDay(date)}`}>
            {dayItems.map((item) => (
              <li key={item.id} data-selected={item.id === selectedId || undefined}>
                <button type="button" className={styles.dayItem} onClick={() => selectItem(item)}>
                  <span className={styles.dayItemTop}>
                    <span className={`${kit.mono} ${kit.nowrap}`}>{timeOf(item.at)}</span>
                    <StatusBadge status={item.status} />
                  </span>
                  <span className={styles.chipTitle} title={item.title}>
                    {item.title}
                  </span>
                  <CollisionChip count={collide(item)} />
                </button>
                <ItemMenu item={item} actions={actions} />
              </li>
            ))}
          </ul>
        )}
        <h3 className={kit.sectionTitle}>Ближайшие</h3>
        <ul className={styles.nextList}>
          {upcoming.map((item) => (
            <li key={item.id}>
              <button type="button" onClick={() => selectItem(item)}>
                <span className={styles.chipTitle}>{item.title}</span>
                <span className={kit.muted}>
                  {longDay(dayKeyOf(item.at))}, {timeOf(item.at)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Panel>
  );

  return (
    <PreviewPage
      title="Календарь"
      actions={
        <Button icon="send" onPress={() => setPublishOpen(true)}>
          Опубликовать пост
        </Button>
      }
    >
      <div className={styles.layout}>
        <Panel
          title={title}
          note={narrow ? undefined : `${ZONE}, UTC+3`}
          footer={
            <span>{phase === 'ready' && !monthEmpty ? `В месяце: ${inMonth.length} публикаций` : 'Загружаем…'}</span>
          }
        >
          <div className={kit.toolbar} data-narrow={narrow || undefined}>
            <div className={narrow ? styles.segFull : undefined}>
              <SegmentedControl
                label="Вид календаря"
                fullWidth={narrow}
                value={view}
                onChange={(id) => update({ view: id, id: undefined })}
                options={[
                  { id: 'month', label: 'Месяц' },
                  { id: 'week', label: 'Неделя' },
                  { id: 'day', label: 'День' },
                  { id: 'list', label: 'Список' }
                ]}
              />
            </div>
            {narrow ? null : <span className={kit.spacer} />}
            {nav}
            {narrow || view === 'list' ? null : (
              <Select
                label="Месяц"
                inlineLabel
                value={String(monthOfKey(date))}
                onChange={(month) => setDate(keyOfDate(new Date(Date.UTC(2026, Number(month), 1))))}
                options={MONTH_NAMES.map((name, index) => ({ id: String(index), label: name }))}
              />
            )}
          </div>
          {body}
        </Panel>
        {narrow ? null : inspector}
      </div>

      {narrow ? (
        <Drawer
          variant="bottom"
          isOpen={Boolean(selected)}
          onOpenChange={(open) => !open && update({ id: undefined })}
          title={selected ? selected.title : ''}
        >
          {selected ? <ItemDetail item={selected} actions={actions} collisions={collide(selected)} /> : null}
        </Drawer>
      ) : null}

      <Dialog
        isOpen={Boolean(moveItem)}
        onOpenChange={(open) => !open && setMoveItem(null)}
        title="Перенести публикацию"
        description={moveItem ? `«${moveItem.title}». Канал: ${moveItem.channel}.` : undefined}
        footer={
          <>
            <Button variant="secondary" onPress={() => setMoveItem(null)}>
              Не переносить
            </Button>
            <Button
              onPress={() => {
                setMoveItem(null);
                preview();
              }}
            >
              Перенести
            </Button>
          </>
        }
      >
        {moveItem ? (
          <div className={styles.move}>
            <Select label="Новое время" value={moveTo} onChange={setMoveTo} options={moveOptions} />
            <dl className={styles.moveDiff}>
              <div>
                <dt>Было</dt>
                <dd className={kit.mono}>
                  {longDay(dayKeyOf(moveItem.at))}, {timeOf(moveItem.at)}
                </dd>
              </div>
              <Icon name="chevron-right" size={18} />
              <div>
                <dt>Станет</dt>
                <dd className={kit.mono}>{target ? `${longDay(dayKeyOf(target.at))}, ${timeOf(target.at)}` : '—'}</dd>
              </div>
            </dl>
          </div>
        ) : null}
      </Dialog>
      <ConfirmDialog
        isOpen={Boolean(cancelItem)}
        onOpenChange={(open) => !open && setCancelItem(null)}
        title={cancelItem ? `Отменить публикацию «${cancelItem.title}» на ${timeOf(cancelItem.at)}?` : ''}
        description="Пост не уйдёт в канал. Сам пост останется в списке."
        confirmLabel="Отменить публикацию"
        cancelLabel="Не отменять"
        onConfirm={() => {
          setCancelItem(null);
          preview();
        }}
      />
      <PublishDialog isOpen={publishOpen} onOpenChange={setPublishOpen} />
    </PreviewPage>
  );
}
