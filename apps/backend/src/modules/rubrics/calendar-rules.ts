// The days of the greeting cards (31) in a given year (owner's bank, .logs/handoff/rubrics/new/greeting_card/notes.md):
// fixed `MM-DD`, the n-th or last weekday of a month, Масленица from Orthodox Easter, the programmer's 256th day, the
// world sleep day and Black Friday. Pure; `weekday:*`, `any` and `patch` have no date of their own (null).

const DOW = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 } as const;
type Dow = keyof typeof DOW;

const iso = (year: number, month: number, day: number) =>
  `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
const utc = (year: number, month: number, day: number) => new Date(Date.UTC(year, month - 1, day));
const plusDays = (date: Date, days: number) => new Date(date.getTime() + days * 86_400_000);
const isoOf = (date: Date) => date.toISOString().slice(0, 10);

/** Orthodox Easter (Julian computus, shifted to the Gregorian calendar: +13 days in 1900–2099). */
export function orthodoxEaster(year: number): Date {
  const a = year % 4;
  const b = year % 7;
  const c = year % 19;
  const d = (19 * c + 15) % 30;
  const e = (2 * a + 4 * b - d + 34) % 7;
  const month = Math.floor((d + e + 114) / 31);
  const day = ((d + e + 114) % 31) + 1;
  return plusDays(utc(year, month, day), 13);
}

/** The n-th (1-based) given weekday of a month, or the last one with `n = 'last'`. */
function nthWeekday(year: number, month: number, dow: number, n: number | 'last'): Date {
  if (n === 'last') {
    const last = utc(year, month + 1, 0);
    return plusDays(last, -((last.getUTCDay() - dow + 7) % 7));
  }
  const first = utc(year, month, 1);
  return plusDays(first, ((dow - first.getUTCDay() + 7) % 7) + (n - 1) * 7);
}

/** The card's day in `year` (`YYYY-MM-DD`), or null for a date with no fixed day or a rule this code does not know. */
export function resolveCardDate(date: string, year: number): string | null {
  const fixed = /^(\d{2})-(\d{2})$/.exec(date);
  if (fixed !== null) return iso(year, Number(fixed[1]), Number(fixed[2]));
  const rule = /^rule:(.+)$/.exec(date)?.[1];
  if (rule === undefined) return null;
  if (rule === 'maslenitsa') {
    // Прощёное воскресенье, the last day of the week: Easter − 49 days.
    return isoOf(plusDays(orthodoxEaster(year), -49));
  }
  if (rule === 'day-256') return isoOf(plusDays(utc(year, 1, 1), 255));
  // The Friday falling on 13–19 March (UNVERIFIED beyond 2026 per the owner's notes).
  if (rule === 'world-sleep-day') return worldSleepDay(year);
  // The Friday after the fourth Thursday of November.
  if (rule === 'black-friday') return isoOf(plusDays(nthWeekday(year, 11, DOW.thu, 4), 1));
  const nth = /^(\d|last)-(sun|mon|tue|wed|thu|fri|sat)-(\d{2})$/.exec(rule);
  if (nth === null) return null;
  const n = nth[1] === 'last' ? 'last' : Number(nth[1]);
  return isoOf(nthWeekday(year, Number(nth[3]), DOW[nth[2] as Dow], n));
}

function worldSleepDay(year: number): string {
  for (let day = 13; day <= 19; day += 1) if (utc(year, 3, day).getUTCDay() === DOW.fri) return iso(year, 3, day);
  return iso(year, 3, 13);
}

/** `weekday:fri` → 5; null for anything else. */
export function cardWeekday(date: string): number | null {
  const match = /^weekday:(sun|mon|tue|wed|thu|fri|sat)$/.exec(date);
  return match === null ? null : DOW[match[1] as Dow];
}
