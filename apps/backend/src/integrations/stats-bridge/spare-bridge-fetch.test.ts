import { describe, expect, it } from 'vitest';
import { spareBridgeFetch } from './spare-bridge-fetch';

const MAIN = 'https://main.example';
const SPARE = 'https://spare.example';
const own = (status: number, extra: Record<string, string> = {}) =>
  new Response('{}', { status, headers: { 'x-stats-bridge': '1', ...extra } });

function recording(answers: Record<string, () => Response>) {
  const calls: string[] = [];
  const fetchImpl = (async (url: string) => {
    calls.push(url);
    const host = new URL(url).origin;
    const answer = answers[host];
    if (answer === undefined) throw new TypeError('network');
    return answer();
  }) as typeof fetch;
  return { calls, fetch: spareBridgeFetch(MAIN, SPARE, fetchImpl) };
}

describe('spareBridgeFetch', () => {
  it("keeps a source's own refusal from the main bridge: STRATZ's 403 never sends the token to a second address", async () => {
    const bridge = recording({ [MAIN]: () => own(403), [SPARE]: () => own(200) });
    const response = await bridge.fetch(`${MAIN}/stratz/graphql`);
    expect(response.status).toBe(403);
    expect(bridge.calls).toEqual([`${MAIN}/stratz/graphql`]);
  });

  it("moves to the spare when the main bridge is unreachable, asleep or out of the day's traffic", async () => {
    for (const main of [
      undefined,
      () => new Response('Service Suspended', { status: 503 }),
      () => own(429, { 'x-bridge-refusal': 'BRIDGE_DAY_TRAFFIC' })
    ]) {
      const bridge = recording(
        main === undefined ? { [SPARE]: () => own(200) } : { [MAIN]: main, [SPARE]: () => own(200) }
      );
      const response = await bridge.fetch(`${MAIN}/opendota/heroStats?x=1`);
      expect(response.status).toBe(200);
      expect(bridge.calls).toEqual([`${MAIN}/opendota/heroStats?x=1`, `${SPARE}/opendota/heroStats?x=1`]);
    }
  });

  it('does not repeat a call the caller already gave up on', async () => {
    const bridge = recording({ [SPARE]: () => own(200) });
    const aborted = AbortSignal.abort();
    await expect(bridge.fetch(`${MAIN}/stratz/graphql`, { signal: aborted })).rejects.toThrow();
    expect(bridge.calls).toHaveLength(1);
  });
});
