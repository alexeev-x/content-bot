import { describe, expect, it } from 'vitest';
import { describeSlotIntent } from '../model/slot-intent';

describe('calendar slot intent', () => {
  it('does not choose a default occurrence for a repeated local time', () => {
    expect(describeSlotIntent('2026-10-25T03:00', 'Europe/Chisinau', undefined)).toBeNull();
    expect(describeSlotIntent('2026-10-25T03:00', 'Europe/Chisinau', 'first')).toContain('UTC+3');
    expect(describeSlotIntent('2026-10-25T03:00', 'Europe/Chisinau', 'second')).toContain('UTC+2');
  });

  it('does not render a nonexistent local time or malformed intent', () => {
    expect(describeSlotIntent('2026-03-29T03:00', 'Europe/Chisinau', undefined)).toBeNull();
    expect(describeSlotIntent('not-a-date', 'Europe/Chisinau', undefined)).toBeNull();
  });
});
