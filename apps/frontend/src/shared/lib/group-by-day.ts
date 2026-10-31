export type DayGroup<T> = { key: string; label: string; items: T[] };

/** Local calendar day «YYYY-MM-DD» of an instant in a time zone. */
function dayKey(epoch: number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    epoch
  );
}

function dayNumber(key: string): number {
  const [year, month, day] = key.split('-').map(Number);
  return Math.round(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1) / 86_400_000);
}

/** «Сегодня», «Завтра», «Вчера», else «пн, 3 ноября»; the day is counted in the owner's time zone. */
export function dayLabel(epoch: number, timeZone: string, now: Date = new Date()): string {
  const diff = dayNumber(dayKey(epoch, timeZone)) - dayNumber(dayKey(now.getTime(), timeZone));
  if (diff === 0) return 'Сегодня';
  if (diff === 1) return 'Завтра';
  if (diff === -1) return 'Вчера';
  return new Intl.DateTimeFormat('ru-RU', { timeZone, weekday: 'short', day: 'numeric', month: 'long' }).format(epoch);
}

/** Buckets items by local day in the order they first appear; pass the owner time zone (`useOwnerTimezone`). */
export function groupByDay<T>(
  items: readonly T[],
  getDate: (item: T) => string | number | Date,
  timeZone: string,
  now: Date = new Date()
): DayGroup<T>[] {
  const groups = new Map<string, DayGroup<T>>();
  for (const item of items) {
    const epoch = new Date(getDate(item)).getTime();
    if (Number.isNaN(epoch)) continue;
    const key = dayKey(epoch, timeZone);
    const group = groups.get(key) ?? { key, label: dayLabel(epoch, timeZone, now), items: [] };
    group.items.push(item);
    groups.set(key, group);
  }
  return [...groups.values()];
}
