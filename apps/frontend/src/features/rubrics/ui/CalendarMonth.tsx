import { RUBRIC_TITLES } from '@alexeev/contracts';
import { useRef, useState, type KeyboardEvent } from 'react';
import { Button, Icon, IconButton, VisuallyHidden } from '../../../shared/ui';
import { monthBounds, monthLabel, monthOf, shiftMonth, type CalendarItem } from '../model/calendar-items';
import { addDays, dayLabel, mskTime, shortDayLabel, weeksOf } from '../model/msk';
import { calendarCopy as text } from './calendar-copy';
import { rubricsCopy as copy } from './copy';
import { slotStateIcon } from './SlotState';
import styles from './CalendarMonth.module.css';

type Props = {
  month: string;
  today: string;
  /** The days that have data: from today to the end of the forecast. */
  windowStart: string;
  windowEnd: string;
  byDay: ReadonlyMap<string, readonly CalendarItem[]>;
  /** Phone: day buttons with dots only; the caller shows the selected day's feed below. */
  compact: boolean;
  selectedDay: string;
  onMonthChange: (month: string) => void;
  onSelectDay: (day: string) => void;
  onOpenDay: (day: string) => void;
  onOpenItem: (item: CalendarItem) => void;
};

const MAX_CHIPS = 3;
const MAX_DOTS = 3;

function Chip({ item, onOpen }: { item: CalendarItem; onOpen: (item: CalendarItem) => void }) {
  const title = RUBRIC_TITLES[item.rubricKey];
  const state = item.kind === 'slot' ? copy.slots.states[item.slot.state] : text.forecast;
  return (
    // Day buttons are the keyboard stops; chips stay reachable by pointer and by screen readers, not by Tab.
    <button
      type="button"
      tabIndex={-1}
      className={styles.chip}
      data-forecast={item.kind === 'forecast' ? '' : undefined}
      aria-label={`${title}, ${mskTime(item.at)}: ${state}`}
      onClick={() => onOpen(item)}
    >
      <Icon name={item.kind === 'slot' ? slotStateIcon(item.slot.state) : 'calendar'} size={12} aria-hidden="true" />
      <span className={styles.chipTime}>{mskTime(item.at)}</span>
      <span className={styles.chipTitle}>{title}</span>
    </button>
  );
}

/** Month header and grid. Monday first, seven equal columns; the day button is the cell's keyboard stop. */
export function CalendarMonth({
  month,
  today,
  windowStart,
  windowEnd,
  byDay,
  compact,
  selectedDay,
  onMonthChange,
  onSelectDay,
  onOpenDay,
  onOpenItem
}: Props) {
  const { first, last } = monthBounds(month);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const [focused, setFocused] = useState<string | null>(null);
  const live = (day: string) => day >= windowStart && day <= windowEnd && monthOf(day) === month;
  const stop = focused !== null && live(focused) ? focused : live(selectedDay) ? selectedDay : null;

  const move = (event: KeyboardEvent, day: string) => {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key];
    if (step === undefined) return;
    event.preventDefault();
    const next = addDays(day, step);
    if (!live(next)) return;
    setFocused(next);
    buttons.current.get(next)?.focus();
  };

  return (
    <div className={styles.month}>
      <div className={styles.header}>
        <h3 className={styles.title} aria-live="polite">
          {monthLabel(month)}
        </h3>
        <div className={styles.nav}>
          <IconButton
            label={text.month.prev}
            icon="chevron-left"
            size="target"
            isDisabled={shiftMonth(month, -1) < monthOf(windowStart)}
            onPress={() => onMonthChange(shiftMonth(month, -1))}
          />
          <IconButton
            label={text.month.next}
            icon="chevron-right"
            size="target"
            isDisabled={shiftMonth(month, 1) > monthOf(windowEnd)}
            onPress={() => onMonthChange(shiftMonth(month, 1))}
          />
          <Button variant="secondary" size="field" onPress={() => onMonthChange(monthOf(today))}>
            {text.month.today}
          </Button>
        </div>
      </div>
      <table className={styles.grid} aria-label={text.month.grid}>
        <thead>
          <tr>
            {copy.weekdays.map((weekday) => (
              <th key={weekday} scope="col" className={styles.weekday}>
                {weekday}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeksOf(first, last).map((week) => (
            <tr key={week[0]}>
              {week.map((day) => {
                if (monthOf(day) !== month) return <td key={day} className={styles.outside} aria-hidden="true" />;
                const items = byDay.get(day) ?? [];
                const isToday = day === today;
                const dayNumber = Number(day.slice(8));
                if (!live(day))
                  return (
                    <td key={day} className={styles.cell} data-empty="">
                      <span className={styles.dateText} data-past="">
                        {dayNumber}
                      </span>
                    </td>
                  );
                return (
                  <td
                    key={day}
                    className={styles.cell}
                    data-today={isToday ? '' : undefined}
                    data-selected={compact && day === selectedDay ? '' : undefined}
                  >
                    <button
                      type="button"
                      ref={(node) => {
                        if (node === null) buttons.current.delete(day);
                        else buttons.current.set(day, node);
                      }}
                      className={styles.date}
                      tabIndex={day === stop ? 0 : -1}
                      aria-current={isToday ? 'date' : undefined}
                      aria-pressed={compact ? day === selectedDay : undefined}
                      aria-label={text.dayButton(dayLabel(day), items.length)}
                      onFocus={() => setFocused(day)}
                      onKeyDown={(event) => move(event, day)}
                      onClick={() => (compact ? onSelectDay(day) : onOpenDay(day))}
                    >
                      {dayNumber}
                    </button>
                    {compact ? (
                      items.length === 0 ? null : (
                        <span className={styles.dots} aria-hidden="true">
                          {items.slice(0, MAX_DOTS).map((item) => (
                            <span
                              key={item.key}
                              className={styles.dot}
                              data-forecast={item.kind === 'forecast' ? '' : undefined}
                            />
                          ))}
                        </span>
                      )
                    ) : (
                      <div className={styles.chips}>
                        {items.slice(0, MAX_CHIPS).map((item) => (
                          <Chip key={item.key} item={item} onOpen={onOpenItem} />
                        ))}
                        {items.length > MAX_CHIPS ? (
                          <button
                            type="button"
                            tabIndex={-1}
                            className={styles.more}
                            aria-label={text.moreLabel(items.length - MAX_CHIPS, shortDayLabel(day))}
                            onClick={() => onOpenDay(day)}
                          >
                            {text.more(items.length - MAX_CHIPS)}
                          </button>
                        ) : null}
                      </div>
                    )}
                    {isToday ? <VisuallyHidden>{text.month.today}</VisuallyHidden> : null}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
