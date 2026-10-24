import { CalendarDateTime, toZoned, type ZonedDateTime } from '@internationalized/date';

export type LocalTimeResolution =
  | { kind: 'gap'; candidates: [] }
  | { kind: 'unique'; candidates: [ZonedDateTime] }
  | { kind: 'fold'; candidates: [ZonedDateTime, ZonedDateTime] };

function sameWallTime(left: ZonedDateTime, right: CalendarDateTime): boolean {
  return (
    left.year === right.year &&
    left.month === right.month &&
    left.day === right.day &&
    left.hour === right.hour &&
    left.minute === right.minute &&
    left.second === right.second &&
    left.millisecond === right.millisecond
  );
}

/** Resolves a wall-clock value without accepting the library's implicit DST disambiguation. */
export function resolveLocalTime(value: CalendarDateTime, timeZone: string): LocalTimeResolution {
  const earlier = toZoned(value, timeZone, 'earlier');
  const later = toZoned(value, timeZone, 'later');
  const matches = [earlier, later].filter((candidate) => sameWallTime(candidate, value));

  const first = matches[0];
  const second = matches[1];
  if (!first) return { kind: 'gap', candidates: [] };
  if (!second || first.toDate().getTime() === second.toDate().getTime()) {
    return { kind: 'unique', candidates: [first] };
  }
  return { kind: 'fold', candidates: [first, second] };
}

export function localDateTime(value: ZonedDateTime): CalendarDateTime {
  return new CalendarDateTime(
    value.year,
    value.month,
    value.day,
    value.hour,
    value.minute,
    value.second,
    value.millisecond
  );
}
