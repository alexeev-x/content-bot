import { describe, expect, it } from 'vitest';
import { createStratzApi } from './stratz-api';
import { createStratzMatches } from './stratz-matches';

// STRATZ allows one token two addresses per 15 minutes (owner, 31.10.2026): its calls stay on the main bridge even
// when a spare is configured and the main one is down. Only OpenDota falls back (spare-bridge-fetch.test.ts).

const MAIN = 'https://main.example';
const SPARE = 'https://spare.example';

function down() {
  const urls: string[] = [];
  const fetchImpl = (async (url: string) => {
    urls.push(url);
    return new Response('asleep', { status: 503 });
  }) as typeof fetch;
  return { urls, fetchImpl };
}

describe('STRATZ never takes the spare bridge', () => {
  it('the aggregate API asks the main bridge only', async () => {
    const { urls, fetchImpl } = down();
    const input = { token: 't', bridgeUrl: MAIN, spareBridgeUrl: SPARE, fetchImpl };
    await createStratzApi(input)
      .heroWeeks(null, 1)
      .catch(() => undefined);
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.every((url) => url.startsWith(`${MAIN}/`))).toBe(true);
  });

  it('the matches API asks the main bridge only', async () => {
    const { urls, fetchImpl } = down();
    const input = { token: 't', bridgeUrl: MAIN, spareBridgeUrl: SPARE, fetchImpl };
    await createStratzMatches(input)
      .leaderboard('europe' as never, 0)
      .catch(() => undefined);
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.every((url) => url.startsWith(`${MAIN}/`))).toBe(true);
  });
});
