import type { DashboardPublicationDto } from '@alexeev/contracts';
import { formatClock, formatDayClock } from '../../../shared/lib/clock';

const LOCALE = 'ru-RU';
const MINUTE = 60_000;

const weekday = new Intl.DateTimeFormat(LOCALE, { weekday: 'short' });
const dayMonthYear = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' });
const dayMonth = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short' });

/** «Вт, 7 окт. 2026 · 21:05»: minute precision, the browser's zone (the owner's). */
export function dateChipText(now: Date): string {
  const day = weekday.format(now);
  const date = dayMonthYear.format(now).replace(/\s?г\.$/, '');
  return `${day.charAt(0).toUpperCase()}${day.slice(1)}, ${date} · ${formatClock(now.toISOString())}`;
}

const startOfDay = (date: Date, shiftDays = 0) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + shiftDays).getTime();

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

/** «Через 1 ч 55 мин» (today), «Завтра, 10:00», «9 окт., 10:00». */
export function untilDetail(iso: string, now: Date): string {
  const at = Date.parse(iso);
  if (at < startOfDay(now, 1)) return `Через ${untilShort(iso, now)}`;
  if (at < startOfDay(now, 2)) return `Завтра, ${formatClock(iso)}`;
  return formatDayClock(iso);
}

/** Day label for a time cell that is not today: «8 окт.»; undefined for the current day. */
export function otherDay(iso: string, now: Date): string | undefined {
  const at = Date.parse(iso);
  return at >= startOfDay(now) && at < startOfDay(now, 1) ? undefined : dayMonth.format(new Date(iso));
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
