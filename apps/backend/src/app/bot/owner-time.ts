// Settings store no time zone, so the bot uses the zone of the latest publication, or this one while
// there is none (docs/BACKEND_ARCHITECTURE.md, "Bot as the entry point").
export const DEFAULT_OWNER_ZONE = 'Europe/Moscow';

// A stored zone was validated when the publication was scheduled, but this only trusts what the runtime accepts.
export function usableZone(zone: string | null | undefined): string {
  if (zone === undefined || zone === null) return DEFAULT_OWNER_ZONE;
  try {
    // Throws a RangeError for a zone the runtime does not know.
    return new Intl.DateTimeFormat('en-US', { timeZone: zone }).resolvedOptions().timeZone;
  } catch {
    return DEFAULT_OWNER_ZONE;
  }
}

interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function localParts(epoch: number, zone: string): LocalParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric'
  }).formatToParts(epoch);
  const pick = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return {
    year: pick('year'),
    month: pick('month'),
    day: pick('day'),
    hour: pick('hour'),
    minute: pick('minute'),
    second: pick('second')
  };
}

// How far the zone is ahead of UTC at this instant.
function offsetMs(epoch: number, zone: string): number {
  const local = localParts(epoch, zone);
  const asUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second);
  return asUtc - Math.floor(epoch / 1000) * 1000;
}

// The instant a local calendar day starts. The offset is read twice because a day that begins after a
// clock change has another offset than the guess made with the first one.
function localMidnight(year: number, month: number, day: number, zone: string): number {
  const guess = Date.UTC(year, month - 1, day);
  return guess - offsetMs(guess - offsetMs(guess, zone), zone);
}

/** [from, to) of the calendar day that contains `epoch` in `zone`, in UTC epoch milliseconds. */
export function dayBounds(epoch: number, zone: string): { from: number; to: number } {
  const { year, month, day } = localParts(epoch, zone);
  return { from: localMidnight(year, month, day, zone), to: localMidnight(year, month, day + 1, zone) };
}

export function formatClock(epoch: number, zone: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: zone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).format(epoch);
}

// "7 октября"
export function formatDay(epoch: number, zone: string): string {
  return new Intl.DateTimeFormat('ru-RU', { timeZone: zone, day: 'numeric', month: 'long' }).format(epoch);
}

// "17 окт., 14:30": for a list line, where the day matters as much as the time.
export function formatShortDateTime(epoch: number, zone: string): string {
  const day = new Intl.DateTimeFormat('ru-RU', { timeZone: zone, day: 'numeric', month: 'short' }).format(epoch);
  return `${day}, ${formatClock(epoch, zone)}`;
}

/** "только что", "5 мин назад", "3 ч назад", "2 дн. назад". */
export function formatAgo(ms: number): string {
  const minutes = Math.floor(Math.max(0, ms) / 60_000);
  if (minutes < 1) return 'только что';
  if (minutes < 60) return `${minutes} мин назад`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} ч назад`;
  return `${Math.floor(hours / 24)} дн. назад`;
}
