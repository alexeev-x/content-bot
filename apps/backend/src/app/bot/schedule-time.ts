// The owner's «when» for a scheduled publication, as typed in the bot (owner, 17.10.2026: «завтра в 2 дня», not
// only «14:00»). Russian words and digits, read in the owner's zone. A pure function: no clock, no I/O.

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const WEEKDAYS: readonly [RegExp, number][] = [
  [/понедельник|(?<![а-я])пн(?![а-я])/, 1],
  [/вторник|(?<![а-я])вт(?![а-я])/, 2],
  [/сред[аую]|(?<![а-я])ср(?![а-я])/, 3],
  [/четверг|(?<![а-я])чт(?![а-я])/, 4],
  [/пятниц[аую]|(?<![а-я])пт(?![а-я])/, 5],
  [/суббот[аую]|(?<![а-я])сб(?![а-я])/, 6],
  [/воскресень[ея]|(?<![а-я])вс(?![а-я])/, 0]
];

const MONTHS = [
  'январ',
  'феврал',
  'март',
  'апрел',
  'ма[йя]',
  'июн',
  'июл',
  'август',
  'сентябр',
  'октябр',
  'ноябр',
  'декабр'
];

/** Wall-clock parts of `at` in `timezone`. */
function partsIn(at: number, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(new Date(at));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday')),
    hour: Number(get('hour')),
    minute: Number(get('minute'))
  };
}

/** The instant a wall-clock time in `timezone` names (twice corrected, so a DST day lands right). */
export function zonedInstant(
  date: { year: number; month: number; day: number },
  hour: number,
  minute: number,
  timezone: string
): number {
  const wanted = Date.UTC(date.year, date.month - 1, date.day, hour, minute);
  let guess = wanted;
  for (let step = 0; step < 2; step += 1) {
    const seen = partsIn(guess, timezone);
    const shown = Date.UTC(seen.year, seen.month - 1, seen.day, seen.hour, seen.minute);
    guess += wanted - shown;
  }
  return guess;
}

/** Hour of day from «2 дня», «7 вечера», «9 утра», «12 ночи», or a 24-hour number. */
function hourOf(value: number, part: string | undefined): number {
  if (part === undefined) return value;
  if (/утр/.test(part)) return value === 12 ? 0 : value;
  if (/дня|днём|днем/.test(part)) return value < 12 ? value + 12 : value;
  if (/вечер/.test(part)) return value < 12 ? value + 12 : value;
  if (/ноч/.test(part)) return value === 12 ? 0 : value >= 9 ? value + 12 : value;
  return value;
}

export type ParsedTime = { ok: true; at: number; rolledToTomorrow: boolean } | { ok: false };

/**
 * Reads «через 2 часа», «завтра в 2 дня», «в пятницу в 10», «20.10 18:00», «20 октября в 15», «18:30», «вечером».
 * A time without a day that has passed today means tomorrow (`rolledToTomorrow`). Anything else is not a time.
 */
export function parseScheduleTime(input: string, now: number, timezone: string): ParsedTime {
  const text = input.toLowerCase().replaceAll('ё', 'е').replace(/\s+/g, ' ').trim();
  if (text === '') return { ok: false };

  // Relative: «через 2 часа», «через 30 минут», «через час», «через полчаса», «через 1.5 часа».
  // `\w` is ASCII only in JS: Cyrillic endings are spelled out.
  const relative = /через\s+(полчаса|час|(\d+(?:[.,]\d+)?)\s*(минут[а-я]*|мин|час[а-я]*|ч)(?![а-я]))/.exec(text);
  if (relative) {
    if (relative[1] === 'полчаса') return { ok: true, at: now + 30 * MINUTE_MS, rolledToTomorrow: false };
    if (relative[1] === 'час') return { ok: true, at: now + HOUR_MS, rolledToTomorrow: false };
    const amount = Number((relative[2] ?? '').replace(',', '.'));
    const unit = relative[3] ?? '';
    if (!Number.isFinite(amount) || amount <= 0) return { ok: false };
    const ms = unit.startsWith('мин') ? amount * MINUTE_MS : amount * HOUR_MS;
    return { ok: true, at: Math.round(now + ms), rolledToTomorrow: false };
  }

  const today = partsIn(now, timezone);
  let date: { year: number; month: number; day: number } | null = null;
  // Calendar days, not 24-hour steps: a 25-hour day of a DST change must not turn «завтра» into today.
  const shift = (days: number) => {
    const at = new Date(Date.UTC(today.year, today.month - 1, today.day + days));
    return { year: at.getUTCFullYear(), month: at.getUTCMonth() + 1, day: at.getUTCDate() };
  };

  // Day: «послезавтра», «завтра», «сегодня», a weekday, «20.10[.2026]», «20 октября».
  if (/послезавтра/.test(text)) date = shift(2);
  else if (/завтра/.test(text)) date = shift(1);
  else if (/сегодня/.test(text)) date = shift(0);
  if (date === null) {
    for (const [pattern, weekday] of WEEKDAYS) {
      if (!pattern.test(text)) continue;
      const ahead = (weekday - today.weekday + 7) % 7 || 7;
      date = shift(ahead);
      break;
    }
  }
  // «18.30» is a date only when it can be one (month 1–12); otherwise it is a time, read below.
  const dotted = /(?<![\d:])(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?(?![\d:])/.exec(text);
  const numeric = dotted !== null && Number(dotted[2]) >= 1 && Number(dotted[2]) <= 12 ? dotted : null;
  const named = new RegExp(`(?<!\\d)(\\d{1,2})\\s+(${MONTHS.join('|')})`).exec(text);
  let explicitDate = false;
  if (date === null && (numeric || named)) {
    const day = Number(numeric ? numeric[1] : named?.[1]);
    const month = numeric
      ? Number(numeric[2])
      : MONTHS.findIndex((stem) => new RegExp(`^${stem}`).test(named?.[2] ?? '')) + 1;
    let year = numeric?.[3] ? Number(numeric[3].length === 2 ? `20${numeric[3]}` : numeric[3]) : today.year;
    if (month < 1 || month > 12 || day < 1 || day > 31) return { ok: false };
    // A date already behind us this year is next year's.
    if (!numeric?.[3] && Date.UTC(year, month - 1, day) < Date.UTC(today.year, today.month - 1, today.day)) year += 1;
    date = { year, month, day };
    explicitDate = true;
  }

  // Time: «18:30», «18.30» (when not a date), «в 18», «в 2 дня», «в полдень»; or a part of the day alone.
  const withoutDate = numeric && explicitDate ? text.replace(numeric[0], ' ') : text;
  let hour: number | null = null;
  let minute = 0;
  const clock = /(?<!\d)(\d{1,2})[:.](\d{2})(?!\d)/.exec(withoutDate);
  if (clock) {
    hour = Number(clock[1]);
    minute = Number(clock[2]);
    const part = /(утра|дня|вечера|ночи)/.exec(withoutDate.slice(clock.index))?.[1];
    hour = hourOf(hour, part);
  } else if (/полдень/.test(text)) hour = 12;
  else if (/полночь/.test(text)) hour = 0;
  else {
    const spoken = /(?:^|\s)(?:в|к|на)\s+(\d{1,2})(?:\s*(?:час[а-я]*|ч))?(?:\s+(утра|дня|вечера|ночи))?(?![\d.:])/.exec(
      withoutDate
    );
    const bare = /(?<![\d.])(\d{1,2})\s+(утра|дня|вечера|ночи)/.exec(withoutDate);
    const found = spoken ?? bare;
    if (found) hour = hourOf(Number(found[1]), found[2]);
    else if (/утром/.test(text)) hour = 9;
    else if (/дн[её]м/.test(text)) hour = 13;
    else if (/вечером/.test(text)) hour = 19;
    else if (/ночью/.test(text)) hour = 23;
  }
  if (hour === null) {
    // A day without a time is not enough: a post at midnight is never what was meant.
    return { ok: false };
  }
  if (hour > 23 || minute > 59) return { ok: false };

  let rolledToTomorrow = false;
  if (date === null) {
    date = shift(0);
    if (zonedInstant(date, hour, minute, timezone) <= now) {
      date = shift(1);
      rolledToTomorrow = true;
    }
  }
  return { ok: true, at: zonedInstant(date, hour, minute, timezone), rolledToTomorrow };
}

/** «сегодня в 18:30», «завтра в 10:00», «пт, 24 окт. в 14:00» in the owner's zone. */
export function describeTime(at: number, now: number, timezone: string): string {
  const time = new Intl.DateTimeFormat('ru-RU', { timeZone: timezone, hour: '2-digit', minute: '2-digit' }).format(
    new Date(at)
  );
  const day = (value: number) => {
    const parts = partsIn(value, timezone);
    return Date.UTC(parts.year, parts.month - 1, parts.day);
  };
  const days = Math.round((day(at) - day(now)) / DAY_MS);
  if (days === 0) return `сегодня в ${time}`;
  if (days === 1) return `завтра в ${time}`;
  const date = new Intl.DateTimeFormat('ru-RU', {
    timeZone: timezone,
    weekday: 'short',
    day: 'numeric',
    month: 'short'
  }).format(new Date(at));
  return `${date} в ${time}`;
}
