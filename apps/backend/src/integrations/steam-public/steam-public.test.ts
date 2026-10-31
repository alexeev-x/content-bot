import { describe, expect, it } from 'vitest';
import { createSteamPublicApi, SteamPublicError } from './steam-public';

// Akamai in front of api.steampowered.com and steamcommunity.com refuses a Cloudflare Worker's address with an HTML
// «Access Denied» page (30.10.2026). The Web API paths then go once to Steam's mirror; the community pages have none.

const NEWS = { appnews: { newsitems: [{ title: 'Patch', contents: 'Text', date: 1_700_000_000 }] } };
const DENIED = () =>
  new Response('<html><body><h1>Access Denied</h1></body></html>', {
    status: 403,
    headers: { 'content-type': 'text/html' }
  });
const ok = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

function scripted(answers: Record<string, () => Response>) {
  const calls: string[] = [];
  const fetchImpl = (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    calls.push(url);
    const host = new URL(url).host;
    const answer = answers[host];
    if (answer === undefined) throw new Error(`unexpected host ${host}`);
    return answer();
  }) as typeof fetch;
  return { calls, fetchImpl };
}

const failure = async (run: () => Promise<unknown>) => {
  try {
    await run();
  } catch (error) {
    return error as SteamPublicError;
  }
  throw new Error('did not fail');
};

describe('Steam public reads behind Akamai', () => {
  it('asks the mirror for the announcements when the main address answers the HTML 403', async () => {
    const { calls, fetchImpl } = scripted({
      'api.steampowered.com': DENIED,
      'community.steam-api.com': () => ok(NEWS)
    });
    const news = await createSteamPublicApi({ fetchImpl }).dotaNews();
    expect(news).toMatchObject([{ title: 'Patch', publishedAt: 1_700_000_000_000 }]);
    expect(calls).toHaveLength(2);
    expect(calls[1]).toContain('https://community.steam-api.com/ISteamNews/GetNewsForApp/v2/?appid=570');
  });

  it('does not touch the mirror while the main address answers', async () => {
    const { calls, fetchImpl } = scripted({ 'api.steampowered.com': () => ok(NEWS) });
    await createSteamPublicApi({ fetchImpl }).dotaNews();
    expect(calls).toHaveLength(1);
  });

  it('sends the Workshop item request to the mirror with the same form', async () => {
    const bodies: string[] = [];
    const details = { response: { publishedfiledetails: [{ title: 'Set', preview_url: 'https://x/p.png' }] } };
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith('https://api.steampowered.com/')) return DENIED();
      if (url.startsWith('https://community.steam-api.com/')) {
        bodies.push(String(init?.body));
        return ok(details);
      }
      return new Response('', { status: 404 });
    }) as typeof fetch;
    const item = await createSteamPublicApi({ fetchImpl }).workshopItem('123');
    expect(item).toMatchObject({ title: 'Set', previewUrl: 'https://x/p.png' });
    expect(bodies).toEqual(['itemcount=1&publishedfileids%5B0%5D=123']);
  });

  it('names the block STEAM_BLOCKED and says what happened when the mirror fails too', async () => {
    const { calls, fetchImpl } = scripted({
      'api.steampowered.com': DENIED,
      'community.steam-api.com': () => new Response('down', { status: 502 })
    });
    const error = await failure(() => createSteamPublicApi({ fetchImpl }).dotaNews());
    expect(error).toMatchObject({ code: 'STEAM_BLOCKED', httpStatus: 502 });
    expect(error.detail).toContain('зеркало community.steam-api.com');
    expect(error.detail).toContain('Akamai) не пускает');
    expect(calls).toHaveLength(2);
  });

  it('has no mirror for the Workshop page: one call, STEAM_BLOCKED', async () => {
    const { calls, fetchImpl } = scripted({ 'steamcommunity.com': DENIED });
    const error = await failure(() => createSteamPublicApi({ fetchImpl }).workshopTrendingIds());
    expect(error).toMatchObject({ code: 'STEAM_BLOCKED', httpStatus: 403 });
    expect(error.detail).toContain('Access Denied');
    expect(calls).toHaveLength(1);
  });

  it('does not take a JSON 403 for a block, nor repeat a body that does not fit', async () => {
    const refused = scripted({
      'api.steampowered.com': () => new Response('{"error":"forbidden"}', { status: 403 }),
      'community.steam-api.com': () => new Response('{"error":"forbidden"}', { status: 403 })
    });
    expect(await failure(() => createSteamPublicApi({ fetchImpl: refused.fetchImpl }).dotaNews())).toMatchObject({
      code: 'STEAM_HTTP'
    });
    const odd = scripted({ 'api.steampowered.com': () => ok({ nothing: true }) });
    expect(await failure(() => createSteamPublicApi({ fetchImpl: odd.fetchImpl }).dotaNews())).toMatchObject({
      code: 'STEAM_SHAPE'
    });
    expect(odd.calls).toHaveLength(1);
  });

  it('does not repeat a call the caller aborted', async () => {
    const controller = new AbortController();
    const calls: string[] = [];
    const fetchImpl = (async (input: RequestInfo | URL) => {
      calls.push(String(input));
      controller.abort();
      throw new DOMException('aborted', 'AbortError');
    }) as typeof fetch;
    const error = await failure(() => createSteamPublicApi({ fetchImpl }).dotaNews(controller.signal));
    expect(error.code).toBe('STEAM_FETCH');
    expect(calls).toHaveLength(1);
  });
});
