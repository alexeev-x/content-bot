import { describe, expect, it } from 'vitest';
import { dateChipText, nextPublication, untilDetail, untilShort } from '../model/format';

// Local-time dates keep the expectations independent of the machine's zone.
const NOW = new Date(2026, 9, 7, 21, 5);
const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute).toISOString();

describe('dashboard time formats', () => {
  it('writes the date chip with minute precision and a capitalised weekday', () => {
    expect(dateChipText(NOW)).toBe('Ср, 7 окт. 2026 · 21:05');
  });

  it('shortens a distance to minutes, hours or days', () => {
    expect(untilShort(at(7, 21, 50), NOW)).toBe('45 мин');
    expect(untilShort(at(8, 1), NOW)).toBe('3 ч 55 мин');
    expect(untilShort(at(8, 3, 5), NOW)).toBe('6 ч');
    expect(untilShort(at(10, 21, 5), NOW)).toBe('3 дн.');
    expect(untilShort(at(7, 20), NOW)).toBe('0 мин');
  });

  it('names the next publication «Через …» today, «Завтра, …» tomorrow and the date later', () => {
    const early = new Date(2026, 9, 7, 8, 0);
    expect(untilDetail(at(7, 10, 0), early)).toBe('Через 2 ч');
    expect(untilDetail(at(8, 10), NOW)).toBe('Завтра, 10:00');
    expect(untilDetail(at(9, 10), NOW)).toBe('9 окт., 10:00');
  });

  it('picks the first pending publication still ahead, never a sent or past one', () => {
    const row = (publicationId: string, scheduledAt: string, status: 'sent' | 'scheduled' | 'failed') => ({
      publicationId,
      scheduledAt,
      status,
      postTitle: 'x',
      destinationName: 'y'
    });
    const today = [row('a', at(7, 9), 'sent'), row('b', at(7, 20), 'scheduled'), row('c', at(7, 22), 'failed')];
    const upcoming = [row('d', at(8, 10), 'scheduled')];
    expect(nextPublication(today, upcoming, NOW)?.publicationId).toBe('d');
    expect(nextPublication([row('e', at(7, 23), 'scheduled')], upcoming, NOW)?.publicationId).toBe('e');
    expect(nextPublication([], [], NOW)).toBeUndefined();
  });
});
