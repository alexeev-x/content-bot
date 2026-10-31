import { describe, expect, it } from 'vitest';
import { orthodoxEaster, resolveCardDate } from './calendar-rules';
import { closest, SIMILAR_AT, similarity } from './similarity';
import { withJoke } from './types';

// The greeting cards' days (dates from the owner's notes, calend.ru), the text similarity and the joke rotation.

describe('greeting card days', () => {
  it.each([
    ['01-01', 2027, '2027-01-01'],
    ['rule:maslenitsa', 2026, '2026-02-22'],
    ['rule:maslenitsa', 2027, '2027-03-14'],
    ['rule:last-sun-08', 2026, '2026-08-30'],
    ['rule:1-fri-08', 2026, '2026-08-07'],
    ['rule:3-fri-12', 2026, '2026-12-18'],
    ['rule:black-friday', 2026, '2026-11-27'],
    ['rule:day-256', 2026, '2026-09-13'],
    ['rule:day-256', 2028, '2028-09-12'],
    ['rule:world-sleep-day', 2026, '2026-03-13'],
    ['weekday:fri', 2026, null],
    ['any', 2026, null],
    ['patch', 2026, null]
  ] as const)('%s in %i is %s', (date, year, expected) => {
    expect(resolveCardDate(date, year)).toBe(expected);
  });

  it('finds Orthodox Easter', () => {
    expect(orthodoxEaster(2026).toISOString().slice(0, 10)).toBe('2026-04-12');
    expect(orthodoxEaster(2027).toISOString().slice(0, 10)).toBe('2027-05-02');
  });
});

describe('similarity', () => {
  it('catches a retelling and lets a different text through', () => {
    const earlier = 'Пятёрка купила варды, керри пришёл на драку, а мидер опять молчит в чате';
    expect(
      similarity(earlier, 'пятёрка купила варды керри пришёл на драку а мидер опять молчит')
    ).toBeGreaterThanOrEqual(SIMILAR_AT);
    expect(closest('Сегодня Valve выпустили новый сет на Пуджа', [earlier])).toBeLessThan(SIMILAR_AT);
  });
});

describe('joke option rotation', () => {
  it('skips the recent jokes and brings back the least recent when all were used', () => {
    expect(withJoke(['Да'], () => 0, ['a', 'b', 'c'], ['a', 'b']).at(-1)).toBe('c');
    expect(withJoke(['Да'], () => 0, ['a', 'b', 'c'], ['a', 'b', 'c']).at(-1)).toBe('c');
  });
});
