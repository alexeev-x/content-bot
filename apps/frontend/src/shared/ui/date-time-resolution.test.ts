import { CalendarDateTime } from '@internationalized/date';
import { describe, expect, it } from 'vitest';
import { resolveLocalTime } from './date-time-resolution';

const ZONE = 'Europe/Chisinau';

describe('resolveLocalTime', () => {
  it('rejects a local time inside the spring-forward gap', () => {
    expect(resolveLocalTime(new CalendarDateTime(2026, 3, 29, 3, 30), ZONE)).toEqual({ kind: 'gap', candidates: [] });
  });

  it('returns both explicit offsets for a fall-back fold', () => {
    const result = resolveLocalTime(new CalendarDateTime(2026, 10, 25, 3, 30), ZONE);
    expect(result.kind).toBe('fold');
    if (result.kind !== 'fold') throw new Error('Expected an ambiguous local time');
    expect(result.candidates.map((candidate) => candidate.offset)).toEqual([3 * 60 * 60_000, 2 * 60 * 60_000]);
    expect(result.candidates.map((candidate) => candidate.toDate().toISOString())).toEqual([
      '2026-10-25T00:30:00.000Z',
      '2026-10-25T01:30:00.000Z'
    ]);
  });

  it('keeps an ordinary local time unique', () => {
    const result = resolveLocalTime(new CalendarDateTime(2026, 10, 24, 3, 30), ZONE);
    expect(result.kind).toBe('unique');
    if (result.kind !== 'unique') throw new Error('Expected an ordinary local time');
    expect(result.candidates[0]?.toDate().toISOString()).toBe('2026-10-24T00:30:00.000Z');
  });
});
