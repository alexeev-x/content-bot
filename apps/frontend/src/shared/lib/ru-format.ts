/** Picks the Russian plural form: 1 пост, 2 поста, 5 постов. */
export function pluralRu(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

const relativeFormat = new Intl.RelativeTimeFormat('ru-RU', { numeric: 'auto', style: 'short' });
const STEPS: ReadonlyArray<{ unit: Intl.RelativeTimeFormatUnit; ms: number }> = [
  { unit: 'day', ms: 86_400_000 },
  { unit: 'hour', ms: 3_600_000 },
  { unit: 'minute', ms: 60_000 }
];

/** «5 мин. назад», «вчера»; under a minute is «только что». A week or older falls back to the date. */
export function relativeTimeRu(iso: string, now: number): string {
  const diff = new Date(iso).getTime() - now;
  const abs = Math.abs(diff);
  if (abs < 60_000) return 'только что';
  if (abs >= 7 * 86_400_000) return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium' }).format(new Date(iso));
  const step = STEPS.find((candidate) => abs >= candidate.ms) ?? STEPS[STEPS.length - 1]!;
  return relativeFormat.format(Math.round(diff / step.ms), step.unit);
}
