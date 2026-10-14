import { formatClock } from '../../../shared/lib/clock';

const LOCALE = 'ru-RU';

/** «Вт, 7 окт. 2026 · 21:05»: minute precision, the browser's zone (the owner's). */
export function dateChipText(now: Date, timezone = 'Europe/Moscow'): string {
  const weekday = new Intl.DateTimeFormat(LOCALE, { weekday: 'short', timeZone: timezone });
  const dayMonthYear = new Intl.DateTimeFormat(LOCALE, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: timezone
  });
  const day = weekday.format(now);
  const date = dayMonthYear.format(now).replace(/\s?г\.$/, '');
  return `${day.charAt(0).toUpperCase()}${day.slice(1)}, ${date} · ${formatClock(now.toISOString(), timezone)}`;
}
