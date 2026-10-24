function localParts(
  epoch: number,
  timeZone: string
): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric'
  }).formatToParts(epoch);
  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
    minute: read('minute'),
    second: read('second')
  };
}

function offsetAt(epoch: number, timeZone: string): number {
  const parts = localParts(epoch, timeZone);
  return (
    Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) -
    Math.floor(epoch / 1000) * 1000
  );
}

function localMidnight(year: number, month: number, day: number, timeZone: string): number {
  const guess = Date.UTC(year, month - 1, day);
  return guess - offsetAt(guess - offsetAt(guess, timeZone), timeZone);
}

/** UTC instants covering a local calendar day; handles DST days that are not 24 hours long. */
export function ownerDayRange(now: Date, timeZone: string): { from: string; to: string } {
  const parts = localParts(now.getTime(), timeZone);
  return {
    from: new Date(localMidnight(parts.year, parts.month, parts.day, timeZone)).toISOString(),
    to: new Date(localMidnight(parts.year, parts.month, parts.day + 1, timeZone)).toISOString()
  };
}

/** A range of local calendar days, including today, converted to UTC instants. */
export function ownerDaysRange(now: Date, timeZone: string, days: number): { from: string; to: string } {
  if (!Number.isInteger(days) || days < 1 || days > 366) throw new RangeError('days must be between 1 and 366');
  const parts = localParts(now.getTime(), timeZone);
  const endDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + 1));
  const startDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day - days + 1));
  return {
    from: new Date(
      localMidnight(startDate.getUTCFullYear(), startDate.getUTCMonth() + 1, startDate.getUTCDate(), timeZone)
    ).toISOString(),
    to: new Date(
      localMidnight(endDate.getUTCFullYear(), endDate.getUTCMonth() + 1, endDate.getUTCDate(), timeZone)
    ).toISOString()
  };
}

/** Each day's UTC bounds in a consecutive range of owner-local calendar days. */
export function ownerDayRanges(now: Date, timeZone: string, days: number): Array<{ from: string; to: string }> {
  if (!Number.isInteger(days) || days < 1 || days > 366) throw new RangeError('days must be between 1 and 366');
  const parts = localParts(now.getTime(), timeZone);
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + index));
    const next = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + index + 1));
    return {
      from: new Date(
        localMidnight(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), timeZone)
      ).toISOString(),
      to: new Date(
        localMidnight(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), timeZone)
      ).toISOString()
    };
  });
}

export function utcOffsetLabel(now: Date, timeZone: string): string {
  const value = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
    .formatToParts(now)
    .find((part) => part.type === 'timeZoneName')?.value;
  const match = value ? /^GMT(?:([+-])(\d{2}):(\d{2}))?$/.exec(value) : null;
  if (!match || !match[1] || (match[2] === '00' && match[3] === '00')) return 'UTC';
  const hour = String(Number(match[2]));
  return match[3] === '00' ? `UTC${match[1]}${hour}` : `UTC${match[1]}${hour}:${match[3]}`;
}
