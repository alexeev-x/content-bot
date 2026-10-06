import { describe, expect, it } from 'vitest';
import { createIdempotencyTracker } from './idempotency';

describe('idempotency tracker', () => {
  it('reuses the key for a retry of the same payload', () => {
    const tracker = createIdempotencyTracker();
    const first = tracker.keyFor({ title: 'A', body: '' });
    expect(tracker.keyFor({ title: 'A', body: '' })).toBe(first);
  });

  it('issues a new key when the payload changes', () => {
    const tracker = createIdempotencyTracker();
    expect(tracker.keyFor({ title: 'A' })).not.toBe(tracker.keyFor({ title: 'B' }));
  });

  it('issues a new key for a new intent after success, even with the same payload', () => {
    const tracker = createIdempotencyTracker();
    const first = tracker.keyFor({ title: 'A' });
    tracker.release(first);
    expect(tracker.keyFor({ title: 'A' })).not.toBe(first);
  });
});

describe('idempotency tracker with overlapping intents', () => {
  it('keeps the key of intent B when intent A succeeds and releases', () => {
    const tracker = createIdempotencyTracker();
    const keyA = tracker.keyFor({ title: 'A' });
    const keyB = tracker.keyFor({ title: 'B' });
    tracker.release(keyA);
    expect(tracker.keyFor({ title: 'B' })).toBe(keyB);
  });

  it('keeps the key of A when B was tracked meanwhile', () => {
    const tracker = createIdempotencyTracker();
    const keyA = tracker.keyFor({ title: 'A' });
    tracker.keyFor({ title: 'B' });
    expect(tracker.keyFor({ title: 'A' })).toBe(keyA);
  });
});
