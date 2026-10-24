import { describe, expect, it } from 'vitest';
import { clampTrimRange, filmstripTimes, formatClock, nudgeTrim } from './video-trim';

describe('clampTrimRange', () => {
  it('keeps the range inside the media', () => {
    expect(clampTrimRange({ start: -2, end: 99 }, 12, 'start')).toEqual({ start: 0, end: 12 });
    expect(clampTrimRange({ start: -2, end: 99 }, 12, 'end')).toEqual({ start: 0, end: 12 });
  });
  it('holds the one-second minimum against the handle being moved', () => {
    expect(clampTrimRange({ start: 9.8, end: 10 }, 12, 'start')).toEqual({ start: 9, end: 10 });
    expect(clampTrimRange({ start: 4, end: 4.2 }, 12, 'end')).toEqual({ start: 4, end: 5 });
  });
  it('lets a media shorter than the minimum use its whole length', () => {
    expect(clampTrimRange({ start: 0.2, end: 0.5 }, 0.6, 'start')).toEqual({ start: 0, end: 0.6 });
  });
  it('moves the start left when the end handle hits the media end', () => {
    expect(clampTrimRange({ start: 11.5, end: 12 }, 12, 'end')).toEqual({ start: 11, end: 12 });
  });
});

describe('nudgeTrim', () => {
  it('steps a handle and clamps', () => {
    expect(nudgeTrim({ start: 1, end: 5 }, 10, 'start', 1)).toEqual({ start: 2, end: 5 });
    expect(nudgeTrim({ start: 4.5, end: 5 }, 10, 'start', 1)).toEqual({ start: 4, end: 5 });
    expect(nudgeTrim({ start: 0, end: 9.5 }, 10, 'end', 1)).toEqual({ start: 0, end: 10 });
  });
});

describe('filmstripTimes and formatClock', () => {
  it('spreads frames over the duration', () => {
    const times = filmstripTimes(10, 5);
    expect(times).toHaveLength(5);
    expect(times[0]).toBeCloseTo(1);
    expect(times[4]).toBeCloseTo(9);
  });
  it('formats m:ss.s', () => {
    expect(formatClock(75.34)).toBe('1:15.3');
    expect(formatClock(3)).toBe('0:03.0');
  });
});
