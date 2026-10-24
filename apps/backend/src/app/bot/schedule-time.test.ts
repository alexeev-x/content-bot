import { describe, expect, it } from 'vitest';
import { describeTime, parseScheduleTime } from './schedule-time';

// Saturday 17.10.2026, 12:00 in Moscow (UTC+3, no DST).
const NOW = Date.UTC(2026, 9, 17, 9, 0);
const MSK = 'Europe/Moscow';
const at = (text: string, timezone = MSK) => parseScheduleTime(text, NOW, timezone);
const utc = (month: number, day: number, hour: number, minute = 0) => Date.UTC(2026, month - 1, day, hour, minute);

describe('parseScheduleTime', () => {
  it.each([
    ['завтра в 2 дня', utc(10, 18, 11)],
    ['в 7 вечера', utc(10, 17, 16)],
    ['18:30', utc(10, 17, 15, 30)],
    ['сегодня в 18.30', utc(10, 17, 15, 30)],
    ['в 18.30', utc(10, 17, 15, 30)],
    ['в пятницу в 10', utc(10, 23, 7)],
    ['20.10 18:00', utc(10, 20, 15)],
    ['20 октября в 15', utc(10, 20, 12)],
    ['послезавтра утром', utc(10, 19, 6)],
    ['завтра вечером', utc(10, 18, 16)],
    ['Завтра В 10 Утра', utc(10, 18, 7)]
  ])('reads «%s»', (text, expected) => {
    expect(at(text)).toEqual({ ok: true, at: expected, rolledToTomorrow: false });
  });

  it('counts «через …» from now', () => {
    expect(at('через 2 часа')).toMatchObject({ ok: true, at: NOW + 2 * 3_600_000 });
    expect(at('через полчаса')).toMatchObject({ ok: true, at: NOW + 30 * 60_000 });
    expect(at('через 15 минут')).toMatchObject({ ok: true, at: NOW + 15 * 60_000 });
    expect(at('через час')).toMatchObject({ ok: true, at: NOW + 3_600_000 });
  });

  it('moves a time already past today to tomorrow and says so', () => {
    expect(at('в 9 утра')).toEqual({ ok: true, at: utc(10, 18, 6), rolledToTomorrow: true });
    expect(at('в полдень')).toEqual({ ok: true, at: utc(10, 18, 9), rolledToTomorrow: true });
    expect(at('в 12 ночи')).toEqual({ ok: true, at: utc(10, 17, 21), rolledToTomorrow: true });
  });

  it('moves «завтра» by the calendar on a 25-hour DST day', () => {
    // Berlin, 00:30 on 25.10.2026 (summer time ends at 03:00 that night): tomorrow is the 26th.
    const night = Date.UTC(2026, 9, 24, 22, 30);
    expect(parseScheduleTime('завтра в 10', night, 'Europe/Berlin')).toMatchObject({ ok: true, at: utc(10, 26, 9) });
  });

  it('takes the zone into account, across a DST change', () => {
    // Chisinau leaves summer time on 25.10.2026: UTC+3 before, UTC+2 after.
    expect(at('20.10 10:00', 'Europe/Chisinau')).toMatchObject({ at: utc(10, 20, 7) });
    expect(at('26.10 10:00', 'Europe/Chisinau')).toMatchObject({ at: utc(10, 26, 8) });
  });

  it.each(['завтра', 'привет', 'в 25', '', 'через минуту лол нет', '32.10 10:00'])('refuses «%s»', (text) => {
    expect(at(text).ok).toBe(false);
  });
});

describe('describeTime', () => {
  it('says today, tomorrow or the date in the owner zone', () => {
    expect(describeTime(utc(10, 17, 15, 30), NOW, MSK)).toBe('сегодня в 18:30');
    expect(describeTime(utc(10, 18, 7), NOW, MSK)).toBe('завтра в 10:00');
    expect(describeTime(utc(10, 23, 7), NOW, MSK)).toMatch(/23 окт\.? в 10:00$/);
  });
});
