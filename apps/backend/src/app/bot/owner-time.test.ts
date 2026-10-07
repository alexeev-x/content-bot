import { describe, expect, it } from 'vitest';
import { DEFAULT_OWNER_ZONE, dayBounds, formatAgo, formatClock, usableZone } from './owner-time';

const HOUR = 60 * 60_000;

describe('dayBounds', () => {
  it('is the local calendar day of a zone with a fixed offset', () => {
    // 2027-01-15 08:00Z is 11:00 in Moscow (UTC+3).
    const { from, to } = dayBounds(Date.UTC(2027, 0, 15, 8), 'Europe/Moscow');
    expect(new Date(from).toISOString()).toBe('2027-01-14T21:00:00.000Z');
    expect(new Date(to).toISOString()).toBe('2027-01-15T21:00:00.000Z');
  });

  it('puts an instant just after local midnight into the new day, and one just before into the old one', () => {
    const midnight = Date.UTC(2027, 0, 14, 21);
    expect(dayBounds(midnight, 'Europe/Moscow').from).toBe(midnight);
    expect(dayBounds(midnight - 1, 'Europe/Moscow').to).toBe(midnight);
  });

  it('handles a half-hour offset', () => {
    const { from, to } = dayBounds(Date.UTC(2027, 0, 15, 12), 'Asia/Kolkata');
    expect(new Date(from).toISOString()).toBe('2027-01-14T18:30:00.000Z');
    expect(to - from).toBe(24 * HOUR);
  });

  it('is 23 hours long on the day a zone springs forward and 25 on the day it falls back', () => {
    const spring = dayBounds(Date.UTC(2027, 2, 14, 18), 'America/New_York');
    expect(spring.to - spring.from).toBe(23 * HOUR);
    expect(new Date(spring.from).toISOString()).toBe('2027-03-14T05:00:00.000Z');
    const fall = dayBounds(Date.UTC(2027, 10, 7, 18), 'America/New_York');
    expect(fall.to - fall.from).toBe(25 * HOUR);
  });

  it('takes the local day, which may already be the next calendar day in UTC terms (UTC+14)', () => {
    // 12:00Z is 02:00 of 16 January in Kiritimati, so that day began at 10:00Z on the 15th.
    const { from } = dayBounds(Date.UTC(2027, 0, 15, 12), 'Pacific/Kiritimati');
    expect(new Date(from).toISOString()).toBe('2027-01-15T10:00:00.000Z');
  });
});

describe('usableZone', () => {
  it('keeps a zone the runtime knows and falls back to Europe/Moscow otherwise', () => {
    expect(usableZone('Asia/Tokyo')).toBe('Asia/Tokyo');
    expect(usableZone('Mars/Olympus')).toBe(DEFAULT_OWNER_ZONE);
    expect(usableZone(null)).toBe(DEFAULT_OWNER_ZONE);
    expect(usableZone(undefined)).toBe(DEFAULT_OWNER_ZONE);
  });
});

describe('formatting', () => {
  it('writes a clock time in the zone, 24 hours', () => {
    expect(formatClock(Date.UTC(2027, 0, 15, 8, 5), 'Europe/Moscow')).toBe('11:05');
    expect(formatClock(Date.UTC(2027, 0, 15, 21, 0), 'Europe/Moscow')).toBe('00:00');
  });

  it.each([
    [0, 'только что'],
    [59_000, 'только что'],
    [5 * 60_000, '5 мин назад'],
    [3 * HOUR, '3 ч назад'],
    [49 * HOUR, '2 дн. назад']
  ])('says how long ago %i ms was', (ms, text) => {
    expect(formatAgo(ms)).toBe(text);
  });
});
