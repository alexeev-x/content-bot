import { describe, expect, it } from 'vitest';
import { calendarEventTimeLabel } from './calendar-event-time';

// Europe/Berlin: its EU DST rules are identical across tzdata versions (Europe/Chisinau changed in 2022).
const ZONE = 'Europe/Berlin';

describe('calendarEventTimeLabel', () => {
  it('disambiguates both occurrences of a repeated local time', () => {
    expect(calendarEventTimeLabel('2026-10-25T00:00:00.000Z', ZONE)).toBe('02:00 (UTC+2)');
    expect(calendarEventTimeLabel('2026-10-25T01:00:00.000Z', ZONE)).toBe('02:00 (UTC+1)');
  });

  it('does not add offset noise to an unambiguous time', () => {
    expect(calendarEventTimeLabel('2026-10-24T00:00:00.000Z', ZONE)).toBe('02:00');
  });
});
