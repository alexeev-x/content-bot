const LOCALE = 'ru-RU';

export function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

/** `UTC+3`, `UTC+5:30`, `UTC` for the zone's offset at the given instant. */
export function utcOffsetLabel(instant: Date, timeZone: string): string {
  const part = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
    .formatToParts(instant)
    .find((item) => item.type === 'timeZoneName')?.value;
  const match = part ? /^GMT(?:([+-])(\d{2}):(\d{2}))?$/.exec(part) : null;
  if (!match || match[1] === undefined) return 'UTC';
  const hours = String(Number(match[2]));
  return match[3] === '00' ? `UTC${match[1]}${hours}` : `UTC${match[1]}${hours}:${match[3]}`;
}

/** «7 окт., 12:00» in an explicit zone. */
export function formatShort(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone,
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).format(new Date(iso));
}

/** «7 октября 2026 г., 12:00» in an explicit zone. */
export function formatLong(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).format(new Date(iso));
}

/** «7 октября 2026 г., 12:00:05»: the timeline shows seconds because attempts happen within a minute. */
export function formatPrecise(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone,
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).format(new Date(iso));
}

/** «12:00, Europe/Moscow (UTC+3)» — time, explicit zone and offset (skill ui-patterns). */
export function formatWithZone(iso: string, timeZone: string): string {
  return `${formatShort(iso, timeZone)}, ${timeZone} (${utcOffsetLabel(new Date(iso), timeZone)})`;
}

export function formatUtc(iso: string): string {
  return `${new Date(iso).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}
