import { RUBRIC_TITLES, type RubricKey } from '@alexeev/contracts';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { ApiError } from '../../../shared/api/http-client';
import { groupByDay } from '../../../shared/lib/group-by-day';
import {
  Disclosure,
  EmptyState,
  ErrorState,
  GroupedList,
  Icon,
  Panel,
  PanelList,
  SegmentedControl,
  Skeleton,
  useMediaQuery
} from '../../../shared/ui';
import { rubricCalendarQueryOptions, rubricForecastQueryOptions } from '../api/rubrics-queries';
import { itemsByDay, mergeCalendar, type CalendarItem } from '../model/calendar-items';
import { addDays, mondayIndex, mskTime } from '../model/msk';
import { CalendarDrawer, type CalendarTarget } from './CalendarDrawer';
import { CalendarEntryRow } from './CalendarEntryRow';
import { CalendarMonth } from './CalendarMonth';
import { calendarCopy } from './calendar-copy';
import { rubricsCopy as copy } from './copy';
import styles from './RubricsForecast.module.css';

type View = 'month' | 'list';

/** The channel's slots are Moscow slots whatever the owner's zone. */
const MSK = 'Europe/Moscow';
/** Real slots are asked for as far as the forecast reaches (the API takes up to 42 days). */
const CALENDAR_DAYS = 34;

type Props = {
  /** The Moscow day the page opened on: the calendar starts there. */
  today: string;
  onOpenRubric: (key: RubricKey) => void;
};

/** «Рубрики» → Календарь: real slots first, then the forecast, as a month or a list; one drawer for every entry. */
export function RubricsForecast({ today, onOpenRubric }: Props) {
  const forecast = useQuery(rubricForecastQueryOptions());
  const calendarEnd = addDays(today, CALENDAR_DAYS);
  const slots = useQuery(rubricCalendarQueryOptions(today, calendarEnd));
  const phone = useMediaQuery('(max-width: 859px)');
  const [view, setView] = useState<View>('month');
  const [start, setStart] = useState(() => addDays(today, -mondayIndex(today)));
  const [selectedDay, setSelectedDay] = useState(today);
  const [target, setTarget] = useState<CalendarTarget | null>(null);

  const items = useMemo(
    () =>
      forecast.data === undefined || slots.data === undefined
        ? []
        : mergeCalendar(slots.data.slots, forecast.data, today),
    [forecast.data, slots.data, today]
  );
  const byDay = useMemo(() => itemsByDay(items), [items]);

  if (forecast.isPending || slots.isPending)
    return (
      <Panel>
        <output className={styles.loading} aria-busy="true" aria-label={copy.loading}>
          <Skeleton width="100%" height={320} />
        </output>
      </Panel>
    );
  if (forecast.isError || slots.isError) {
    const error = forecast.error ?? slots.error;
    return (
      <Panel>
        <ErrorState
          message={copy.error}
          requestId={error instanceof ApiError ? error.requestId : undefined}
          onRetry={() => void Promise.all([forecast.refetch(), slots.refetch()])}
        />
      </Panel>
    );
  }

  const windowEnd = forecast.data.until > calendarEnd ? forecast.data.until : calendarEnd;
  const changeStart = (next: string) => {
    setStart(next);
    const last = addDays(next, 34);
    // The phone feed must always show a day of the range on screen.
    if (selectedDay < next || selectedDay > last) setSelectedDay(today >= next && today <= last ? today : next);
  };
  const openItem = (item: CalendarItem) => setTarget({ kind: 'item', item });
  const dayItems = (day: string): readonly CalendarItem[] => byDay.get(day) ?? [];
  const days = groupByDay(items, (item) => item.at, MSK);

  const content =
    items.length === 0 ? (
      <EmptyState size="compact" icon="calendar" title={calendarCopy.empty} hint={calendarCopy.emptyHint} />
    ) : view === 'list' ? null : (
      <>
        <CalendarMonth
          start={start}
          today={today}
          windowStart={today}
          windowEnd={windowEnd}
          byDay={byDay}
          compact={phone}
          selectedDay={selectedDay}
          onStartChange={changeStart}
          onSelectDay={setSelectedDay}
          onOpenDay={(day) => setTarget({ kind: 'day', day })}
          onOpenItem={openItem}
        />
        {phone ? (
          dayItems(selectedDay).length === 0 ? (
            <EmptyState size="compact" icon="calendar" title={calendarCopy.emptyDay} />
          ) : (
            <PanelList aria-label={selectedDay}>
              {dayItems(selectedDay).map((item) => (
                <CalendarEntryRow key={item.key} item={item} onPress={openItem} />
              ))}
            </PanelList>
          )
        ) : null}
      </>
    );

  return (
    <div className={styles.stack}>
      <Disclosure
        id="rubrics-forecast-note"
        title={
          <span className={styles.note}>
            <Icon name="help" size={16} />
            {copy.forecastTitle}
          </span>
        }
      >
        <p className={styles.noteBody}>{copy.forecastBody}</p>
      </Disclosure>
      <Panel>
        <div className={styles.panel}>
          <div className={styles.toolbar}>
            <SegmentedControl
              label={copy.views.label}
              options={[
                { id: 'month', label: copy.views.month, icon: 'calendar' },
                { id: 'list', label: copy.views.list, icon: 'menu' }
              ]}
              value={view}
              onChange={(id) => setView(id === 'list' ? 'list' : 'month')}
            />
            <span className={styles.computed}>{copy.computedAt(mskTime(forecast.data.computedAt))}</span>
          </div>
          {content}
        </div>
      </Panel>
      {view === 'list' && items.length > 0 ? (
        // Outside the panel: a panel clips, and the day headers must stick to the page's scroll.
        <div className={styles.sticky}>
          <GroupedList
            variant="chip"
            groups={days.map((day) => ({ id: day.key, label: day.label, count: day.items.length }))}
          >
            {(id) => (
              <Panel>
                <PanelList aria-label={days.find((day) => day.key === id)?.label}>
                  {(days.find((day) => day.key === id)?.items ?? []).map((item) => (
                    <CalendarEntryRow key={item.key} item={item} onPress={openItem} />
                  ))}
                </PanelList>
              </Panel>
            )}
          </GroupedList>
        </div>
      ) : null}
      {forecast.data.unavailable.length === 0 ? null : (
        <Disclosure id="rubrics-unavailable" title={copy.unavailableTitle(forecast.data.unavailable.length)}>
          <ul className={styles.unavailable}>
            {forecast.data.unavailable.map((each) => (
              <li key={each.rubricKey}>
                <strong>{RUBRIC_TITLES[each.rubricKey]}</strong>{' '}
                <span className={styles.reason}>
                  {copy.missing(each.missing.map((need) => copy.needs[need]).join(', '))}
                </span>
              </li>
            ))}
          </ul>
        </Disclosure>
      )}
      <CalendarDrawer
        target={target}
        dayItems={dayItems}
        onClose={() => setTarget(null)}
        onOpenItem={openItem}
        onOpenRubric={(key) => {
          setTarget(null);
          onOpenRubric(key);
        }}
      />
    </div>
  );
}
