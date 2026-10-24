import type { DashboardPublicationDto } from '@alexeev/contracts';
import { formatClock } from '../../../shared/lib/clock';
import { ownerDayRange } from '../../../shared/lib/owner-timezone';

const LOCALE = 'ru-RU';
const MINUTE = 60_000;

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

const startOfDay = (date: Date, timezone: string, shiftDays = 0) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric'
  }).formatToParts(date);
  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  const localDate = new Date(Date.UTC(read('year'), read('month') - 1, read('day') + shiftDays));
  return Date.parse(ownerDayRange(localDate, timezone).from);
};

/** Whole-minute distance: «45 мин», «1 ч 55 мин», «2 ч», «3 дн.»; never negative. */
export function untilShort(iso: string, now: Date): string {
  const minutes = Math.max(0, Math.round((Date.parse(iso) - now.getTime()) / MINUTE));
  if (minutes < 60) return `${minutes} мин`;
  if (minutes < 24 * 60) {
    const rest = minutes % 60;
    return rest ? `${Math.floor(minutes / 60)} ч ${rest} мин` : `${minutes / 60} ч`;
  }
  return `${Math.floor(minutes / (24 * 60))} дн.`;
}

/** Day label for a time cell that is not today: «8 окт.»; undefined for the current day. */
export function otherDay(iso: string, now: Date, timezone = 'Europe/Moscow'): string | undefined {
  const at = Date.parse(iso);
  if (at >= startOfDay(now, timezone) && at < startOfDay(now, timezone, 1)) return undefined;
  return new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', timeZone: timezone }).format(new Date(iso));
}

const PENDING = new Set(['scheduled', 'queued', 'retry_wait']);

/** The next publication still ahead of `now`: today's rows first, then the following days. */
export function nextPublication(
  today: readonly DashboardPublicationDto[],
  upcoming: readonly DashboardPublicationDto[],
  now: Date
): DashboardPublicationDto | undefined {
  return [...today, ...upcoming].find(
    (item) => PENDING.has(item.status) && Date.parse(item.scheduledAt) > now.getTime()
  );
}
