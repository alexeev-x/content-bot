import { CalendarDateTime } from '@internationalized/date';
import { resolveLocalTime } from '../../../shared/ui/date-time-resolution';
import { utcOffsetLabel } from '../../../shared/lib/owner-timezone';

function wallTime(instant: Date, timeZone: string): CalendarDateTime {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(instant);
  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return new CalendarDateTime(read('year'), read('month'), read('day'), read('hour'), read('minute'), read('second'));
}

/** Adds the UTC offset only when a local wall time occurs twice during a DST fold. */
export function calendarEventTimeLabel(instant: string, timeZone: string): string {
  const date = new Date(instant);
  const time = new Intl.DateTimeFormat('ru-RU', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).format(date);
  const resolution = resolveLocalTime(wallTime(date, timeZone), timeZone);
  return resolution.kind === 'fold' ? `${time} (${utcOffsetLabel(date, timeZone)})` : time;
}
