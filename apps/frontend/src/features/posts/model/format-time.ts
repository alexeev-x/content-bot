const exactFormat = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit'
});
const clockFormat = new Intl.DateTimeFormat('ru-RU', { timeStyle: 'short' });
const relativeFormat = new Intl.RelativeTimeFormat('ru-RU', { numeric: 'auto' });

const STEPS: ReadonlyArray<{ unit: Intl.RelativeTimeFormatUnit; ms: number }> = [
  { unit: 'day', ms: 86_400_000 },
  { unit: 'hour', ms: 3_600_000 },
  { unit: 'minute', ms: 60_000 }
];

/** Exact local time; the zone is never printed (it lives in Settings). */
export function formatExact(iso: string): string {
  return exactFormat.format(new Date(iso));
}

export function formatClock(iso: string): string {
  return clockFormat.format(new Date(iso));
}

/** «5 минут назад», «вчера»; under a minute is «только что». Weeks and older fall back to the exact date. */
export function formatRelative(iso: string, now: number): string {
  const diff = new Date(iso).getTime() - now;
  const abs = Math.abs(diff);
  if (abs < 60_000) return 'только что';
  if (abs >= 7 * 86_400_000) return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium' }).format(new Date(iso));
  const step = STEPS.find((candidate) => abs >= candidate.ms) ?? STEPS[STEPS.length - 1]!;
  return relativeFormat.format(Math.round(diff / step.ms), step.unit);
}
