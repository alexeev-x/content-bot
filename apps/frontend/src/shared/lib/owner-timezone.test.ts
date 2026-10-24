import { describe, expect, it } from 'vitest';
import { ownerDayRange, ownerDayRanges, ownerDaysRange, utcOffsetLabel } from './owner-timezone';

describe('owner timezone ranges', () => {
  it('uses the configured local day across spring DST transition', () => {
    const range = ownerDayRange(new Date('2026-03-08T12:00:00.000Z'), 'America/New_York');
    expect(range).toEqual({ from: '2026-03-08T05:00:00.000Z', to: '2026-03-09T04:00:00.000Z' });
  });

  it('uses the configured local day across fall DST transition', () => {
    const range = ownerDayRange(new Date('2026-11-01T12:00:00.000Z'), 'America/New_York');
    expect(range).toEqual({ from: '2026-11-01T04:00:00.000Z', to: '2026-11-02T05:00:00.000Z' });
  });

  it('builds consecutive local days without assuming 24-hour UTC intervals', () => {
    const now = new Date('2026-03-08T12:00:00.000Z');
    const ranges = ownerDayRanges(now, 'America/New_York', 2);
    expect(ranges).toEqual([
      { from: '2026-03-08T05:00:00.000Z', to: '2026-03-09T04:00:00.000Z' },
      { from: '2026-03-09T04:00:00.000Z', to: '2026-03-10T04:00:00.000Z' }
    ]);
    expect(ownerDaysRange(now, 'America/New_York', 2)).toEqual({
      from: '2026-03-07T05:00:00.000Z',
      to: '2026-03-09T04:00:00.000Z'
    });
    expect(utcOffsetLabel(now, 'America/New_York')).toBe('UTC-4');
  });
});
