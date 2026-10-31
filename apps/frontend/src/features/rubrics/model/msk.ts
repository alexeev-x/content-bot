// The rubrics' calendar is in Moscow time whatever the owner's time zone: the channel's slots are Moscow slots
// (owner, 30.10.2026). Moscow is UTC+3 all year.

const MSK_OFFSET_MS = 3 * 3_600_000;
const DAY_MS = 86_400_000;

/** `HH:MM` in Moscow. */
export function mskTime(iso: string): string {
  return new Date(Date.parse(iso) + MSK_OFFSET_MS).toISOString().slice(11, 16);
}

/** 0 Monday … 6 Sunday of a `YYYY-MM-DD` day. */
export function mondayIndex(day: string): number {
  return (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7;
}

export function addDays(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** The Mondays of the weeks the days span: the month grid's rows. */
export function weeksOf(from: string, until: string): string[][] {
  const start = addDays(from, -mondayIndex(from));
  const weeks: string[][] = [];
  for (let monday = start; monday <= until; monday = addDays(monday, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, index) => addDays(monday, index)));
  }
  return weeks;
}

const DAY_LABEL = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', weekday: 'long', timeZone: 'UTC' });
const SHORT_LABEL = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** «понедельник, 2 ноября». */
export const dayLabel = (day: string) => DAY_LABEL.format(new Date(`${day}T00:00:00Z`));
/** «2 нояб.». */
export const shortDayLabel = (day: string) => SHORT_LABEL.format(new Date(`${day}T00:00:00Z`));
