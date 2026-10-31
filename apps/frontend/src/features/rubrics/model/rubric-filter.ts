import type { RubricItemDto } from '@alexeev/contracts';
import { mskDay } from './msk';

export type RubricFilter = 'all' | 'active' | 'off' | 'attention';
export type RubricGroupId = 'active' | 'attention' | 'waiting' | 'off';

/** Rubrics that need the owner or a service: the bank ran out or a service is missing. */
const needsAttention = (item: RubricItemDto) => item.state === 'paused' || item.state === 'unavailable';

export function groupOf(item: RubricItemDto): RubricGroupId {
  if (item.state === 'active') return 'active';
  if (needsAttention(item)) return 'attention';
  return item.state === 'waiting' ? 'waiting' : 'off';
}

export function matchesFilter(item: RubricItemDto, filter: RubricFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'active') return item.state === 'active';
  if (filter === 'off') return item.state === 'off';
  return needsAttention(item);
}

export function countByFilter(items: readonly RubricItemDto[]): Record<RubricFilter, number> {
  return {
    all: items.length,
    active: items.filter((item) => matchesFilter(item, 'active')).length,
    off: items.filter((item) => matchesFilter(item, 'off')).length,
    attention: items.filter((item) => matchesFilter(item, 'attention')).length
  };
}

/** Rubrics that cannot go out now (a service is missing or the bank ran out), for the footer list. */
export const blockedItems = (items: readonly RubricItemDto[]) => items.filter(needsAttention);

/** Whole Moscow days from `today` to the day of `iso`: negative is the past. */
export function dayOffset(iso: string, today: string): number {
  const from = Date.parse(`${today}T00:00:00Z`);
  return Math.round((Date.parse(`${mskDay(iso)}T00:00:00Z`) - from) / 86_400_000);
}

/** «сегодня», «вчера», «3 дн. назад», «завтра», «через 3 дн.». */
export function relativeDay(iso: string, today: string): string {
  const offset = dayOffset(iso, today);
  if (offset === 0) return 'сегодня';
  if (offset === -1) return 'вчера';
  if (offset === 1) return 'завтра';
  return offset < 0 ? `${-offset} дн. назад` : `через ${offset} дн.`;
}
