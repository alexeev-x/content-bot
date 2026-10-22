import { describe, expect, it } from 'vitest';
import {
  attemptsExhausted,
  backoffMs,
  LEASE_MS,
  MAX_ATTEMPTS,
  MAX_SEND_MEDIA_BYTES,
  MAX_SEND_TIMEOUT_MS,
  minLeaseForSend,
  retryRunAt,
  SEND_TIMEOUT_MS,
  sendTimeoutMs
} from './dispatch-policy';

describe('dispatch policy', () => {
  it('a lease always outlives the send it allows, the largest upload included', () => {
    expect(minLeaseForSend(0)).toBeGreaterThan(SEND_TIMEOUT_MS);
    expect(LEASE_MS).toBeGreaterThan(minLeaseForSend(0));
    // The claim's own reads (target, revision, media) happen before the mark: they get the rest of the lease.
    expect(LEASE_MS - minLeaseForSend(0, sendTimeoutMs(MAX_SEND_MEDIA_BYTES))).toBeGreaterThanOrEqual(10_000);
  });

  it('gives a send time for its files at 1 MB/s on top of the base, capped', () => {
    const mb = 1_000_000;
    expect(sendTimeoutMs(0)).toBe(SEND_TIMEOUT_MS);
    expect(sendTimeoutMs(45 * mb)).toBe(55_000);
    expect(sendTimeoutMs(MAX_SEND_MEDIA_BYTES)).toBe(MAX_SEND_TIMEOUT_MS);
    expect(sendTimeoutMs(500 * mb)).toBe(MAX_SEND_TIMEOUT_MS);
  });

  it('gives up exactly at the last attempt', () => {
    expect(attemptsExhausted(MAX_ATTEMPTS - 1)).toBe(false);
    expect(attemptsExhausted(MAX_ATTEMPTS)).toBe(true);
  });

  it('backs off exponentially up to a cap', () => {
    expect([1, 2, 3].map(backoffMs)).toEqual([5_000, 10_000, 20_000]);
    expect(backoffMs(30)).toBe(10 * 60_000);
  });

  it('never retries sooner than Telegram asked, and adds jitter on top', () => {
    expect(retryRunAt({ now: 1_000, attempt: 1, retryAfterSec: 30, random: 0 })).toBe(31_000);
    expect(retryRunAt({ now: 1_000, attempt: 1, retryAfterSec: 30, random: 0.5 })).toBe(33_500);
    // Telegram asks for 1 s: the backoff of the attempt is the floor.
    expect(retryRunAt({ now: 1_000, attempt: 3, retryAfterSec: 1, random: 0 })).toBe(21_000);
    expect(retryRunAt({ now: 0, attempt: 1, retryAfterSec: 10 ** 9, random: 0 })).toBe(24 * 60 * 60_000);
  });
});
