const LOCALE = 'ru-RU';

/** «14:30» in the browser's zone (the owner's zone: one owner, one zone per session). */
export function formatClock(iso: string): string {
  return new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(
    new Date(iso)
  );
}

/** «7 окт., 14:30» in the browser's zone. */
export function formatDayClock(iso: string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).format(new Date(iso));
}
