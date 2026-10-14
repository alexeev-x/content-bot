import { describe, expect, it } from 'vitest';
import { calendarEventTimeLabel } from './calendar-event-time';

describe('calendarEventTimeLabel', () => {
  it('disambiguates both occurrences of a repeated local time', () => {
    expect(calendarEventTimeLabel('2026-10-25T00:00:00.000Z', 'Europe/Chisinau')).toBe('03:00 (UTC+3)');
    expect(calendarEventTimeLabel('2026-10-25T01:00:00.000Z', 'Europe/Chisinau')).toBe('03:00 (UTC+2)');
  });

  it('does not add offset noise to an unambiguous time', () => {
    expect(calendarEventTimeLabel('2026-10-24T00:00:00.000Z', 'Europe/Chisinau')).toBe('03:00');
  });
});
