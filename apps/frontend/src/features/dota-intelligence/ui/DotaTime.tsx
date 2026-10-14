import { relativeTimeRu } from '../../../shared/lib/ru-format';

function fullTime(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: timezone
  }).format(new Date(iso));
}

/** Relative time in the text; the exact date with the owner's zone lives once in the tooltip and the accessible name. */
export function DotaTime({ iso, now, timezone }: { iso: string; now: number; timezone: string }) {
  const exact = `${fullTime(iso, timezone)}, ${timezone}`;
  return (
    <time dateTime={iso} title={exact} aria-label={exact}>
      {relativeTimeRu(iso, now)}
    </time>
  );
}
