import type { ForecastSlotDto, RubricForecastDto, RubricKey, RubricSlotDto } from '@alexeev/contracts';
import { addDays, mskDay } from './msk';

/** One calendar entry: a real slot, or a forecast line (no slot exists yet). */
export type CalendarItem =
  | { kind: 'slot'; key: string; at: string; day: string; rubricKey: RubricKey; slot: RubricSlotDto }
  | { kind: 'forecast'; key: string; at: string; day: string; rubricKey: RubricKey; forecast: ForecastSlotDto };

/** Slots that no longer compete for the day: a forecast line for the same rubric may stand in their place. */
const DEAD_STATES: readonly RubricSlotDto['state'][] = ['skipped', 'cancelled', 'superseded', 'yielded'];

export const hasPicture = (item: CalendarItem) =>
  item.kind === 'slot' ? item.slot.hasPicture : item.forecast.hasPicture;
export const hasPoll = (item: CalendarItem) => (item.kind === 'slot' ? item.slot.hasPoll : item.forecast.hasPoll);

/**
 * Real slots from `from` on, then the forecast for what has no slot yet, in time order. A forecast line is dropped
 * when a live slot of the same rubric already stands on its day.
 */
export function mergeCalendar(
  slots: readonly RubricSlotDto[],
  forecast: RubricForecastDto,
  from: string
): CalendarItem[] {
  const items: CalendarItem[] = [];
  const taken = new Set<string>();
  for (const slot of slots) {
    const day = mskDay(slot.at);
    if (day < from) continue;
    items.push({ kind: 'slot', key: `slot:${slot.id}`, at: slot.at, day, rubricKey: slot.rubricKey, slot });
    if (!DEAD_STATES.includes(slot.state)) taken.add(`${day}:${slot.rubricKey}`);
  }
  for (const entry of forecast.days) {
    if (entry.date < from) continue;
    for (const line of entry.slots) {
      if (taken.has(`${entry.date}:${line.rubricKey}`)) continue;
      items.push({
        kind: 'forecast',
        key: `forecast:${line.at}:${line.rubricKey}`,
        at: line.at,
        day: entry.date,
        rubricKey: line.rubricKey,
        forecast: line
      });
    }
  }
  return items.sort((a, b) => a.at.localeCompare(b.at) || a.kind.localeCompare(b.kind));
}

export function itemsByDay(items: readonly CalendarItem[]): Map<string, CalendarItem[]> {
  const byDay = new Map<string, CalendarItem[]>();
  for (const item of items) byDay.set(item.day, [...(byDay.get(item.day) ?? []), item]);
  return byDay;
}

/** `YYYY-MM` of a day. */
export const monthOf = (day: string) => day.slice(0, 7);

/** First and last day of a `YYYY-MM` month. */
export function monthBounds(month: string): { first: string; last: string } {
  const next = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 1));
  return { first: `${month}-01`, last: addDays(next.toISOString().slice(0, 10), -1) };
}

export function shiftMonth(month: string, by: number): string {
  const date = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + by, 1));
  return date.toISOString().slice(0, 7);
}

const MONTH_LABEL = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric', timeZone: 'UTC' });
/** «Ноябрь 2026». */
export function monthLabel(month: string): string {
  const text = MONTH_LABEL.format(new Date(`${month}-01T00:00:00Z`)).replace(/\s*г\.$/, '');
  return text.charAt(0).toUpperCase() + text.slice(1);
}
