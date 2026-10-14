import { CalendarDate, CalendarDateTime, parseDate, parseDateTime } from '@internationalized/date';
import type { DestinationDto, PostDto } from '@alexeev/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { PublicationDrawer } from '../../features/publications';
import {
  calendarEvents,
  calendarEventTimeLabel,
  calendarDays,
  calendarRange,
  parseCalendarDate,
  shiftCalendarDate,
  type CalendarView,
  calendarKeys,
  calendarRangeQueryOptions,
  CalendarRangeTooDenseError,
  type CalendarEvent
} from '../../features/calendar';
import { ownerOperationsSettingsQueryOptions } from '../../features/owner-settings';
import { resolveLocalTime } from '../../shared/ui/date-time-resolution';
import { ApiError } from '../../shared/api/http-client';
import { classifyApiError } from '../../shared/api/error-kind';
import { ru } from '../../shared/lib/ru';
import {
  Button,
  Dialog,
  EmptyState,
  ErrorState,
  IconButton,
  PageHeader,
  Panel,
  SegmentedControl,
  Select,
  Skeleton,
  StatusBadge,
  TextField,
  useMediaQuery
} from '../../shared/ui';
import { utcOffsetLabel } from '../../shared/lib/owner-timezone';
import styles from './CalendarPage.module.css';

type Search = { date?: string; view?: CalendarView; destination?: string; id?: string };
type Props = { search: Search; onSearchChange: (patch: Partial<Search>, replace?: boolean) => void };
type FoldChoice = 'first' | 'second' | '';

const VIEW_OPTIONS = [
  { id: 'day', label: 'День' },
  { id: 'week', label: 'Неделя' },
  { id: 'month', label: 'Месяц' }
] as const;
const NARROW = '(max-width: 859px)';

function todayInZone(zone: string): CalendarDate {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date())
    .reduce<Record<string, string>>((values, part) => ({ ...values, [part.type]: part.value }), {});
  return new CalendarDate(Number(parts['year']), Number(parts['month']), Number(parts['day']));
}

function localKey(instant: string, zone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date(instant))
    .reduce<Record<string, string>>((values, part) => ({ ...values, [part.type]: part.value }), {});
  return `${parts['year']}-${parts['month']}-${parts['day']}`;
}

function localHour(instant: string, zone: string): number {
  return Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date(instant))
      .find((part) => part.type === 'hour')?.value ?? '0'
  );
}

function dateLabel(key: string): string {
  return new Intl.DateTimeFormat('ru-RU', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(
    parseDate(key).toDate('UTC')
  );
}

function rangeLabel(start: CalendarDate, view: CalendarView): string {
  if (view === 'day') return dateLabel(start.toString());
  if (view === 'week') {
    const end = start.add({ days: 6 });
    return `${start.day}–${end.day} ${new Intl.DateTimeFormat('ru-RU', { month: 'long', timeZone: 'UTC' }).format(end.toDate('UTC'))}`;
  }
  return new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    start.toDate('UTC')
  );
}

function slotLocalValue(key: string, hour: number): string {
  return `${key}T${String(hour).padStart(2, '0')}:00`;
}

function eventDayMap(events: readonly CalendarEvent[], zone: string): Map<string, CalendarEvent[]> {
  const result = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    if (!event.at) continue;
    const key = localKey(event.at, zone);
    result.set(key, [...(result.get(key) ?? []), event]);
  }
  for (const items of result.values())
    items.sort((left, right) => Date.parse(left.at ?? '') - Date.parse(right.at ?? ''));
  return result;
}

function statusLabel(status: CalendarEvent['status']): string {
  return ru.status[status];
}

export function CalendarPage({ search, onSearchChange }: Props) {
  const narrow = useMediaQuery(NARROW);
  const settings = useQuery(ownerOperationsSettingsQueryOptions());
  const timezone = settings.data?.timezone ?? 'Europe/Moscow';
  const date = parseCalendarDate(search.date) ?? todayInZone(timezone);
  const view = search.view ?? (narrow ? 'day' : 'month');
  const range = calendarRange(date, view, timezone);
  const data = useQuery({ ...calendarRangeQueryOptions(range.from, range.to), enabled: settings.isSuccess });
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [slot, setSlot] = useState('');
  const [fold, setFold] = useState<FoldChoice>('');
  const destinationId = search.destination === 'all' ? undefined : search.destination;
  const destinations = data.data?.destinations ?? [];
  const events = useMemo(() => (data.data ? calendarEvents(data.data, destinationId) : []), [data.data, destinationId]);
  const byDay = useMemo(() => eventDayMap(events, timezone), [events, timezone]);
  const calendarItems = events.filter((event) => event.at !== null);
  const rangeEvents = calendarItems.filter(
    (event) => Date.parse(event.at ?? '') >= Date.parse(range.from) && Date.parse(event.at ?? '') < Date.parse(range.to)
  );
  const selectedPublication = search.id ? data.data?.publications.find((item) => item.id === search.id) : undefined;
  const loading = settings.isPending || data.isPending;
  const error = settings.error ?? data.error;

  function setDate(next: CalendarDate) {
    onSearchChange({ date: next.toString(), id: undefined });
  }

  function chooseSlot(key: string, hour: number) {
    setSlot(slotLocalValue(key, hour));
    setFold('');
  }

  function createDraftFromSlot() {
    const local = parseDateTime(slot);
    const resolution = resolveLocalTime(local, timezone);
    if (resolution.kind === 'gap' || (resolution.kind === 'fold' && !fold)) return;
    const params = new URLSearchParams({ slot, timezone });
    if (destinationId) params.set('destinationId', destinationId);
    if (resolution.kind === 'fold') params.set('fold', fold);
    void navigate({ to: `/posts/new?${params.toString()}` });
  }

  function eventPress(event: CalendarEvent) {
    if (event.kind === 'post' && event.postId) {
      void navigate({ to: '/posts/$id', params: { id: event.postId } });
      return;
    }
    if (event.kind === 'publication') onSearchChange({ id: event.id });
  }

  const stripDays =
    view === 'month'
      ? calendarDays({ ...range, dayCount: 42 })
      : calendarDays({
          ...range,
          dayCount: 7,
          startDate: range.startDate.subtract({ days: (range.startDate.toDate('UTC').getUTCDay() + 6) % 7 })
        });
  const slots = view === 'day' ? [date.toString()] : stripDays.map((day) => day.toString());
  const title = rangeLabel(view === 'month' ? date : range.startDate, view);

  return (
    <>
      <PageHeader
        title="Календарь"
        focusHeadingOnMount
        actions={
          <Button icon="plus" onPress={() => chooseSlot(date.toString(), 10)}>
            Создать пост на это время
          </Button>
        }
      />
      <div className={styles.toolbar}>
        <div className={styles.navigation}>
          <IconButton
            label="Предыдущий период"
            icon="chevron-left"
            onPress={() => setDate(shiftCalendarDate(date, view, -1))}
          />
          <IconButton
            label="Следующий период"
            icon="chevron-right"
            onPress={() => setDate(shiftCalendarDate(date, view, 1))}
          />
          <Button variant="secondary" size="sm" onPress={() => setDate(todayInZone(timezone))}>
            Сегодня
          </Button>
          <span className={styles.rangeTitle} aria-live="polite">
            {title}
          </span>
        </div>
        <SegmentedControl
          label="Вид календаря"
          options={VIEW_OPTIONS}
          value={view}
          onChange={(next) => onSearchChange({ view: next as CalendarView, id: undefined }, true)}
        />
        <Select
          label="Канал"
          inlineLabel
          value={destinationId ?? 'all'}
          options={[
            { id: 'all', label: 'Все' },
            ...destinations.map((destination) => ({ id: destination.id, label: destination.title }))
          ]}
          onChange={(next) => onSearchChange({ destination: next === 'all' ? undefined : next, id: undefined }, true)}
        />
      </div>
      <p className={styles.zoneNote}>
        {timezone} ({utcOffsetLabel(new Date(range.from), timezone)}) · фильтр канала влияет только на публикации
      </p>
      {error ? (
        <CalendarError error={error} onRetry={() => void (settings.isError ? settings.refetch() : data.refetch())} />
      ) : (
        <div className={styles.layout} aria-busy={loading || undefined}>
          <Panel
            title={title}
            note={timezone}
            footer={loading ? 'Загружаем все страницы…' : `${rangeEvents.length} публикаций в периоде`}
          >
            {loading ? (
              <CalendarSkeleton view={view} />
            ) : rangeEvents.length === 0 ? (
              <EmptyState
                icon="calendar"
                title={
                  destinationId ? 'Нет запланированных публикаций для этого канала' : 'В этот период публикаций нет'
                }
                description="Черновики без активных публикаций остаются в отдельном списке."
                action={
                  destinationId ? (
                    <Button variant="secondary" onPress={() => onSearchChange({ destination: undefined }, true)}>
                      Сбросить фильтр
                    </Button>
                  ) : (
                    <Button icon="plus" onPress={() => chooseSlot(date.toString(), 10)}>
                      Создать пост на это время
                    </Button>
                  )
                }
              />
            ) : narrow ? (
              <>
                {view !== 'day' ? (
                  <CompactStrip
                    date={date.toString()}
                    days={stripDays}
                    byDay={byDay}
                    onDay={(key) => setDate(parseDate(key))}
                  />
                ) : null}
                <Agenda keys={slots} byDay={byDay} timezone={timezone} onEvent={eventPress} onSlot={chooseSlot} />
              </>
            ) : view === 'month' ? (
              <MonthGrid
                range={range}
                date={date.toString()}
                timezone={timezone}
                byDay={byDay}
                onDay={(key) => setDate(parseDate(key))}
                onEvent={eventPress}
                onSlot={chooseSlot}
              />
            ) : (
              <HourGrid
                days={view === 'day' ? [date.toString()] : stripDays.map((day) => day.toString())}
                byDay={byDay}
                timezone={timezone}
                onEvent={eventPress}
                onSlot={chooseSlot}
              />
            )}
          </Panel>
          {!narrow ? (
            <div className={styles.inspector}>
              <Panel title={`День · ${dateLabel(date.toString())}`}>
                {(byDay.get(date.toString()) ?? []).length === 0 ? (
                  <div className={styles.agendaEmpty}>
                    <span>Нет публикаций</span>
                    <Button size="sm" variant="secondary" onPress={() => chooseSlot(date.toString(), 10)}>
                      Создать пост на это время
                    </Button>
                  </div>
                ) : (
                  <div className={styles.inspectorEvents}>
                    {(byDay.get(date.toString()) ?? []).map((event) => (
                      <EventButton key={event.id} event={event} timezone={timezone} onPress={() => eventPress(event)} />
                    ))}
                  </div>
                )}
              </Panel>
              <Panel title="Ближайшие" note="В загруженном периоде">
                <UpcomingEvents
                  events={rangeEvents}
                  fromDate={date.toString()}
                  timezone={timezone}
                  onEvent={eventPress}
                />
              </Panel>
              <Unscheduled
                posts={data.data?.unscheduledPosts ?? []}
                onOpen={(id) => void navigate({ to: '/posts/$id', params: { id } })}
              />
            </div>
          ) : (
            <Unscheduled
              posts={data.data?.unscheduledPosts ?? []}
              onOpen={(id) => void navigate({ to: '/posts/$id', params: { id } })}
            />
          )}
        </div>
      )}
      <PublicationDrawer
        timezone={timezone}
        publicationId={selectedPublication?.id ?? search.id ?? null}
        isOpen={Boolean(search.id && settings.isSuccess && !data.error)}
        placeholder={selectedPublication}
        postTitle={
          selectedPublication
            ? data.data?.posts.find((post) => post.id === selectedPublication.postId)?.title
            : undefined
        }
        destinationTitle={
          selectedPublication
            ? destinations.find((item) => item.id === selectedPublication.destinationId)?.title
            : undefined
        }
        onOpenChange={(open) => {
          if (!open) {
            onSearchChange({ id: undefined }, true);
            void queryClient.invalidateQueries({ queryKey: calendarKeys.all });
          }
        }}
      />
      <SlotDialog
        isOpen={Boolean(slot)}
        slot={slot}
        timezone={timezone}
        fold={fold}
        onFold={setFold}
        onSlot={(value) => {
          setSlot(value);
          setFold('');
        }}
        destination={destinationId}
        destinations={destinations}
        onDestination={(next) => onSearchChange({ destination: next === 'all' ? undefined : next }, true)}
        onCreate={createDraftFromSlot}
        onOpenChange={(open) => {
          if (!open) {
            setSlot('');
            setFold('');
          }
        }}
      />
    </>
  );
}

function CalendarError({ error, onRetry }: { error: Error; onRetry: () => void }) {
  if (classifyApiError(error) === 'forbidden')
    return <ErrorState title="Нет доступа" message="Календарь доступен только владельцу." />;
  if (error instanceof CalendarRangeTooDenseError)
    return (
      <ErrorState
        title="Слишком много данных в периоде"
        message="Не удалось загрузить календарь полностью. Выберите более короткий период и повторите загрузку."
        onRetry={onRetry}
      />
    );
  const requestId = error instanceof ApiError ? error.requestId : undefined;
  return (
    <ErrorState
      title="Не удалось загрузить календарь"
      message="Данные не показаны, потому что одна из страниц не загрузилась. Повторите безопасный запрос."
      requestId={requestId}
      onRetry={onRetry}
    />
  );
}

function CalendarSkeleton({ view }: { view: CalendarView }) {
  return (
    <div className={styles.skeleton} aria-busy="true">
      {Array.from({ length: view === 'month' ? 42 : 8 }, (_, index) => (
        <Skeleton key={index} height={view === 'month' ? 56 : 44} />
      ))}
    </div>
  );
}

function CompactStrip({
  date,
  days,
  byDay,
  onDay
}: {
  date: string;
  days: CalendarDate[];
  byDay: Map<string, CalendarEvent[]>;
  onDay: (key: string) => void;
}) {
  return (
    <div className={styles.strip} aria-label="Выбор дня">
      {days.map((day) => {
        const key = day.toString();
        const count = byDay.get(key)?.length ?? 0;
        return (
          <button
            key={key}
            type="button"
            data-selected={key === date || undefined}
            aria-pressed={key === date}
            aria-label={`${dateLabel(key)}${count ? `, публикаций: ${count}` : ''}`}
            onClick={() => onDay(key)}
          >
            <span>{day.day}</span>
            <span className={styles.dotRow} aria-hidden="true">
              {count ? '•' : ''}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function Agenda({
  keys,
  byDay,
  timezone,
  onEvent,
  onSlot
}: {
  keys: string[];
  byDay: Map<string, CalendarEvent[]>;
  timezone: string;
  onEvent: (event: CalendarEvent) => void;
  onSlot: (key: string, hour: number) => void;
}) {
  return (
    <div className={styles.agenda}>
      {keys.map((key) => (
        <section key={key} aria-label={dateLabel(key)}>
          <h3>{dateLabel(key)}</h3>
          {(byDay.get(key) ?? []).length === 0 ? (
            <div className={styles.agendaEmpty}>
              <span>Нет публикаций</span>
              <Button size="sm" variant="secondary" onPress={() => onSlot(key, 10)}>
                Создать пост на это время
              </Button>
            </div>
          ) : (
            (byDay.get(key) ?? []).map((event) => (
              <EventButton key={event.id} event={event} timezone={timezone} onPress={() => onEvent(event)} />
            ))
          )}
        </section>
      ))}
    </div>
  );
}

function EventButton({ event, timezone, onPress }: { event: CalendarEvent; timezone: string; onPress: () => void }) {
  return (
    <button
      type="button"
      className={styles.event}
      onClick={onPress}
      aria-label={`${event.at ? calendarEventTimeLabel(event.at, timezone) : ''}, ${event.title}, ${statusLabel(event.status)}${event.destinationTitle ? `, ${event.destinationTitle}` : ''}`}
    >
      <span className={styles.eventTime}>{event.at ? calendarEventTimeLabel(event.at, timezone) : ''}</span>
      <span className={styles.eventTitle}>{event.title}</span>
      {event.destinationTitle ? <span className={styles.eventDestination}>{event.destinationTitle}</span> : null}
      <StatusBadge status={event.status} />
    </button>
  );
}

function MonthGrid({
  range,
  date,
  timezone,
  byDay,
  onDay,
  onEvent,
  onSlot
}: {
  range: ReturnType<typeof calendarRange>;
  date: string;
  timezone: string;
  byDay: Map<string, CalendarEvent[]>;
  onDay: (key: string) => void;
  onEvent: (event: CalendarEvent) => void;
  onSlot: (key: string, hour: number) => void;
}) {
  const days = calendarDays(range);
  const month = date.slice(0, 7);
  return (
    <div className={styles.month}>
      <div className={styles.weekdays}>
        {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
      <div className={styles.monthGrid}>
        {days.map((day) => {
          const key = day.toString();
          const events = byDay.get(key) ?? [];
          return (
            <div
              key={key}
              className={styles.dayCell}
              data-outside={!key.startsWith(month) || undefined}
              data-selected={key === date || undefined}
            >
              <button
                type="button"
                className={styles.dayHit}
                aria-label={`${dateLabel(key)}, публикаций: ${events.length}`}
                aria-pressed={key === date}
                onClick={() => onDay(key)}
              >
                <span>{day.day}</span>
                {key === date ? <span className={styles.todayLabel}>Выбрано</span> : null}
              </button>
              {events.slice(0, 3).map((event) => (
                <button
                  className={styles.monthEvent}
                  key={event.id}
                  type="button"
                  title={event.title}
                  onClick={() => onEvent(event)}
                >
                  <span>{event.at ? calendarEventTimeLabel(event.at, timezone) : ''}</span>
                  <span>{event.title}</span>
                </button>
              ))}
              {events.length > 3 ? (
                <button type="button" className={styles.more} onClick={() => onDay(key)}>
                  ещё {events.length - 3}
                </button>
              ) : (
                <button type="button" className={styles.createSlot} onClick={() => onSlot(key, 10)}>
                  + 10:00
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HourGrid({
  days,
  byDay,
  timezone,
  onEvent,
  onSlot
}: {
  days: string[];
  byDay: Map<string, CalendarEvent[]>;
  timezone: string;
  onEvent: (event: CalendarEvent) => void;
  onSlot: (key: string, hour: number) => void;
}) {
  return (
    <div className={styles.hours}>
      <div className={styles.hoursHead} style={{ gridTemplateColumns: `56px repeat(${days.length}, minmax(0, 1fr))` }}>
        <span />
        {days.map((day) => (
          <strong key={day}>
            {day.slice(8)} · {day.slice(5, 7)}
          </strong>
        ))}
      </div>
      {Array.from({ length: 24 }, (_, hour) => (
        <div
          key={hour}
          className={styles.hourRow}
          style={{ gridTemplateColumns: `56px repeat(${days.length}, minmax(0, 1fr))` }}
        >
          <span className={styles.hourLabel}>{String(hour).padStart(2, '0')}:00</span>
          {days.map((key) => {
            const events = (byDay.get(key) ?? []).filter((event) => event.at && localHour(event.at, timezone) === hour);
            return (
              <div key={key} className={styles.hourCell}>
                {events.map((event) => (
                  <EventButton key={event.id} event={event} timezone={timezone} onPress={() => onEvent(event)} />
                ))}
                {events.length === 0 ? (
                  <button type="button" className={styles.createSlot} onClick={() => onSlot(key, hour)}>
                    + Создать
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function Unscheduled({ posts, onOpen }: { posts: PostDto[]; onOpen: (id: string) => void }) {
  return (
    <Panel title="Черновики и одобренные без расписания" note={String(posts.length)}>
      {posts.length === 0 ? (
        <p className={styles.noPosts}>Нет постов без активных публикаций.</p>
      ) : (
        <ul className={styles.unscheduled}>
          {posts.map((post) => (
            <li key={post.id}>
              <button type="button" onClick={() => onOpen(post.id)}>
                <span>{post.title || 'Пост без названия'}</span>
                <StatusBadge status={post.status} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function UpcomingEvents({
  events,
  fromDate,
  timezone,
  onEvent
}: {
  events: CalendarEvent[];
  fromDate: string;
  timezone: string;
  onEvent: (event: CalendarEvent) => void;
}) {
  const upcoming = events
    .filter((event) => event.at && localKey(event.at, timezone) >= fromDate && event.status === 'scheduled')
    .sort((left, right) => Date.parse(left.at ?? '') - Date.parse(right.at ?? ''))
    .slice(0, 5);
  if (upcoming.length === 0) return <p className={styles.noPosts}>В загруженном периоде нет ближайших публикаций.</p>;
  return (
    <div className={styles.inspectorEvents}>
      {upcoming.map((event) => (
        <EventButton key={event.id} event={event} timezone={timezone} onPress={() => onEvent(event)} />
      ))}
    </div>
  );
}

function SlotDialog({
  isOpen,
  slot,
  timezone,
  fold,
  onFold,
  onSlot,
  destination,
  destinations,
  onDestination,
  onCreate,
  onOpenChange
}: {
  isOpen: boolean;
  slot: string;
  timezone: string;
  fold: FoldChoice;
  onFold: (choice: FoldChoice) => void;
  onSlot: (value: string) => void;
  destination: string | undefined;
  destinations: DestinationDto[];
  onDestination: (id: string) => void;
  onCreate: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  const [day, time] = slot.split('T');
  let local: CalendarDateTime | null = null;
  try {
    if (day && time && /^\d{4}-\d{2}-\d{2}$/.test(day) && /^\d{2}:\d{2}$/.test(time)) {
      const parsed = parseDate(day);
      local = new CalendarDateTime(
        parsed.year,
        parsed.month,
        parsed.day,
        Number(time.slice(0, 2)),
        Number(time.slice(3, 5))
      );
    }
  } catch {
    local = null;
  }
  const resolution = local ? resolveLocalTime(local, timezone) : null;
  const invalid = !slot || !resolution || resolution.kind === 'gap' || (resolution.kind === 'fold' && !fold);
  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title="Создать черновик на выбранное время"
      description="Календарь передаст локальное время в редактор. Сохранение создаст только черновик; публикация не запланируется автоматически."
      footer={
        <>
          <Button variant="secondary" onPress={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button isDisabled={invalid} onPress={onCreate}>
            Создать черновик
          </Button>
        </>
      }
    >
      <div className={styles.slotForm}>
        <TextField label="Дата и время в календаре" type="datetime-local" value={slot} onChange={onSlot} />
        <p className={styles.zoneNote}>
          {timezone}
          {resolution?.kind === 'unique' ? ` (${utcOffsetLabel(resolution.candidates[0].toDate(), timezone)})` : ''}
        </p>
        {resolution?.kind === 'gap' ? (
          <p className={styles.slotError} role="alert">
            Такого времени нет из-за перехода на летнее время. Выберите другое.
          </p>
        ) : null}
        {resolution?.kind === 'fold' ? (
          <fieldset className={styles.fold}>
            <legend>Это время встречается дважды. Выберите вхождение</legend>
            <label>
              <input type="radio" name="fold" checked={fold === 'first'} onChange={() => onFold('first')} />
              Первое · {utcOffsetLabel(resolution.candidates[0].toDate(), timezone)}
            </label>
            <label>
              <input type="radio" name="fold" checked={fold === 'second'} onChange={() => onFold('second')} />
              Второе · {utcOffsetLabel(resolution.candidates[1].toDate(), timezone)}
            </label>
          </fieldset>
        ) : null}
        <Select
          label="Канал для будущего планирования"
          value={destination ?? 'all'}
          options={[
            { id: 'all', label: 'Не выбран' },
            ...destinations.map((item) => ({ id: item.id, label: item.title }))
          ]}
          onChange={onDestination}
          description="Выбор не создает и не подтверждает публикацию."
        />
      </div>
    </Dialog>
  );
}
