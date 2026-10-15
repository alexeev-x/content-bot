import type { ContentPlatform } from '@alexeev/contracts';

const compact = new Intl.NumberFormat('ru-RU', { notation: 'compact', maximumFractionDigits: 1 });
const exact = new Intl.NumberFormat('ru-RU');

/** «836», «12,5 тыс.», «1,2 млн»; a missing counter is a dash. */
export function formatCount(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  const whole = Math.round(value);
  return whole < 10_000 ? exact.format(whole) : compact.format(whole);
}

export function formatExact(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : exact.format(value);
}

/** «+12», «−3», «0»: the true minus sign, so the sign reads at a glance. */
export function formatDelta(value: number): string {
  if (value > 0) return `+${formatCount(value)}`;
  if (value < 0) return `−${formatCount(-value)}`;
  return '0';
}

export const PLATFORM_LABEL: Record<ContentPlatform, string> = {
  telegram: 'Telegram',
  youtube: 'YouTube',
  tiktok: 'TikTok'
};

/** Telegram shows reactions where the video platforms show likes. */
export function likesLabel(platform: ContentPlatform): string {
  return platform === 'telegram' ? 'Реакции' : 'Лайки';
}

/** Interactions per 100 views, one decimal; null when it cannot be computed. */
export function engagementRate(item: {
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
}): number | null {
  if (item.views === null || item.views === 0) return null;
  const interactions = (item.likes ?? 0) + (item.comments ?? 0) + (item.shares ?? 0);
  if (item.likes === null && item.comments === null && item.shares === null) return null;
  return Math.round((interactions / item.views) * 1000) / 10;
}

const dateOnly = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' });

/** «8 окт., 19:01» in the owner's zone. */
export function formatPublished(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timezone
  }).format(new Date(iso));
}

export function formatDay(day: string): string {
  return dateOnly.format(new Date(`${day}T12:00:00Z`));
}
