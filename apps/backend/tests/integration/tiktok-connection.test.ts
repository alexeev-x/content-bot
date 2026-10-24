import { contentAnalyticsOverviewSchema, tiktokConnectSchema } from '@alexeev/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { testDb } from '../helpers/db';
import { expectError } from '../helpers/expect-error';
import { createApi, fakeClock, OWNER_TOKEN, resetDb, seedSession } from '../helpers/harness';

const KEYS = { TIKTOK_CLIENT_KEY: 'test-client-key', TIKTOK_CLIENT_SECRET: 'test-client-secret' };
const HOUR = 60 * 60_000;

// A scripted TikTok: tokens rotate on every grant, so a refresh is visible in what gets stored.
function fakeTikTok() {
  const calls: string[] = [];
  let grant = 0;
  const fake = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push(url.pathname);
    if (url.pathname === '/v2/oauth/token/') {
      grant += 1;
      const body = new URLSearchParams(String(init?.body));
      if (body.get('client_secret') !== KEYS.TIKTOK_CLIENT_SECRET)
        return Response.json({ error: 'invalid_client' }, { status: 401 });
      return Response.json({
        access_token: `act.access-${grant}`,
        expires_in: 86_400,
        refresh_token: `rft.refresh-${grant}`,
        refresh_expires_in: 31_536_000,
        open_id: 'open-1',
        scope: 'user.info.basic,user.info.profile,user.info.stats,video.list',
        token_type: 'Bearer'
      });
    }
    if (url.pathname === '/v2/user/info/') {
      return Response.json({
        data: {
          user: {
            open_id: 'open-1',
            username: 'alexeev_x',
            follower_count: 8623,
            likes_count: 515_700,
            video_count: 47
          }
        },
        error: { code: 'ok', message: '' }
      });
    }
    if (url.pathname === '/v2/video/list/') {
      return Response.json({
        data: {
          videos: [
            {
              id: '7400000000000000001',
              title: 'БКБ покупают только те…',
              create_time: 1_799_990_000,
              cover_image_url: 'https://p16-sign.tiktokcdn.com/cover.jpeg',
              share_url: 'https://www.tiktok.com/@alexeev_x/video/7400000000000000001',
              view_count: 583_000,
              like_count: 41_000,
              comment_count: 900,
              share_count: 1200
            }
          ],
          cursor: 1_799_990_000_000,
          has_more: false
        },
        error: { code: 'ok', message: '' }
      });
    }
    if (url.pathname === '/v2/oauth/revoke/') return new Response('{}');
    return new Response('not scripted', { status: 500 });
  }) as typeof fetch;
  return { fake, calls };
}

async function connectionRow() {
  return testDb()
    .prepare(
      'SELECT access_token_enc AS access, refresh_token_enc AS refresh, account_name AS name FROM content_connections'
    )
    .first<{ access: string; refresh: string; name: string }>();
}

beforeEach(async () => {
  await resetDb();
  await seedSession({ token: OWNER_TOKEN });
});

describe('TikTok connection', () => {
  it('is unavailable without the app keys and requires the owner to start', async () => {
    const api = createApi();
    await expectError(
      await api.request('/api/v1/content-analytics/tiktok/connect', { method: 'POST' }),
      503,
      'UNAVAILABLE'
    );
    const keyed = createApi({ env: KEYS });
    await expectError(
      await keyed.request('/api/v1/content-analytics/tiktok/connect', { method: 'POST', token: null }),
      401,
      'UNAUTHORIZED'
    );
    const overview = contentAnalyticsOverviewSchema.parse(
      await (await keyed.request('/api/v1/content-analytics')).json()
    );
    expect(overview.sources[2]).toMatchObject({ platform: 'tiktok', state: 'not_configured', connection: 'available' });
  });

  it('connects once per state, stores only encrypted tokens, collects, refreshes and disconnects', async () => {
    const clock = fakeClock();
    const tiktok = fakeTikTok();
    const api = createApi({ clock, env: KEYS, contentFetch: tiktok.fake });

    const started = await api.request('/api/v1/content-analytics/tiktok/connect', { method: 'POST' });
    const cookie = started.headers.get('set-cookie') ?? '';
    expect(cookie).toMatch(/^tiktok_oauth_state=[A-Za-z0-9_-]{43};/);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Path=/api/v1/content-analytics/tiktok/callback');
    const start = tiktokConnectSchema.parse(await started.json());
    const authorize = new URL(start.authorizeUrl);
    expect(authorize.origin + authorize.pathname).toBe('https://www.tiktok.com/v2/auth/authorize/');
    expect(authorize.searchParams.get('client_key')).toBe('test-client-key');
    expect(authorize.searchParams.get('redirect_uri')).toBe(
      'http://localhost/api/v1/content-analytics/tiktok/callback'
    );
    const state = authorize.searchParams.get('state') ?? '';

    // A forged state never reaches TikTok.
    const forged = await api.request(`/api/v1/content-analytics/tiktok/callback?state=${'x'.repeat(43)}&code=c`, {
      token: null
    });
    expect(forged.status).toBe(302);
    expect(forged.headers.get('location')).toBe('/analytics?platform=tiktok&tiktok=expired');
    expect(tiktok.calls).toEqual([]);

    // The consent link opened in a browser without the state cookie (leaked link) links nothing.
    const foreign = await api.request(`/api/v1/content-analytics/tiktok/callback?state=${state}&code=the-code`, {
      token: null
    });
    expect(foreign.headers.get('location')).toBe('/analytics?platform=tiktok&tiktok=expired');
    expect(tiktok.calls).toEqual([]);

    const back = await api.request(`/api/v1/content-analytics/tiktok/callback?state=${state}&code=the-code`, {
      token: null,
      headers: { cookie: `tiktok_oauth_state=${state}` }
    });
    expect(back.headers.get('location')).toBe('/analytics?platform=tiktok&tiktok=connected');
    const row = await connectionRow();
    expect(row?.name).toBe('alexeev_x');
    expect(row?.access).not.toContain('access-1');
    expect(row?.refresh).not.toContain('refresh-1');

    // The same state is single-use.
    const replay = await api.request(`/api/v1/content-analytics/tiktok/callback?state=${state}&code=the-code`, {
      token: null,
      headers: { cookie: `tiktok_oauth_state=${state}` }
    });
    expect(replay.headers.get('location')).toBe('/analytics?platform=tiktok&tiktok=expired');

    const synced = contentAnalyticsOverviewSchema.parse(
      await (await api.request('/api/v1/content-analytics/sync', { method: 'POST' })).json()
    );
    expect(synced.sources[2]).toMatchObject({
      state: 'ok',
      connection: 'connected',
      handle: 'alexeev_x',
      profileUrl: 'https://www.tiktok.com/@alexeev_x',
      followers: 8623
    });
    expect(synced.recent[0]).toMatchObject({ id: 'tiktok:7400000000000000001', views: 583_000, shares: 1200 });

    // A day later the access token is stale: the next collection refreshes it and stores the rotated pair.
    clock.advance(24 * HOUR);
    const before = await connectionRow();
    // The owner's session from the start has expired by now: sign in again.
    const LATER_TOKEN = 'owner-token-1111111111111111111111111111111';
    await seedSession({ token: LATER_TOKEN, createdAt: clock.now() });
    await api.request('/api/v1/content-analytics/sync', { method: 'POST', token: LATER_TOKEN });
    const after = await connectionRow();
    expect(tiktok.calls.filter((path) => path === '/v2/oauth/token/')).toHaveLength(2);
    expect(after?.refresh).not.toBe(before?.refresh);

    const off = await api.request('/api/v1/content-analytics/tiktok/disconnect', {
      method: 'POST',
      token: LATER_TOKEN
    });
    expect(off.status).toBe(204);
    expect(tiktok.calls.at(-1)).toBe('/v2/oauth/revoke/');
    expect(await connectionRow()).toBeNull();
    const overview = contentAnalyticsOverviewSchema.parse(
      await (await api.request('/api/v1/content-analytics', { token: LATER_TOKEN })).json()
    );
    expect(overview.sources[2]).toMatchObject({ state: 'not_configured', connection: 'available' });
  });

  it('reports a denial without calling TikTok', async () => {
    const tiktok = fakeTikTok();
    const api = createApi({ env: KEYS, contentFetch: tiktok.fake });
    const start = tiktokConnectSchema.parse(
      await (await api.request('/api/v1/content-analytics/tiktok/connect', { method: 'POST' })).json()
    );
    const state = new URL(start.authorizeUrl).searchParams.get('state') ?? '';
    const back = await api.request(`/api/v1/content-analytics/tiktok/callback?state=${state}&error=access_denied`, {
      token: null,
      headers: { cookie: `tiktok_oauth_state=${state}` }
    });
    expect(back.headers.get('location')).toBe('/analytics?platform=tiktok&tiktok=denied');
    expect(tiktok.calls).toEqual([]);
  });

  it('revokes the grant on disconnect even after the access token expired', async () => {
    const clock = fakeClock();
    const tiktok = fakeTikTok();
    const api = createApi({ clock, env: KEYS, contentFetch: tiktok.fake });
    const start = tiktokConnectSchema.parse(
      await (await api.request('/api/v1/content-analytics/tiktok/connect', { method: 'POST' })).json()
    );
    const state = new URL(start.authorizeUrl).searchParams.get('state') ?? '';
    await api.request(`/api/v1/content-analytics/tiktok/callback?state=${state}&code=c`, {
      token: null,
      headers: { cookie: `tiktok_oauth_state=${state}` }
    });

    clock.advance(30 * HOUR);
    const LATER_TOKEN = 'owner-token-2222222222222222222222222222222';
    await seedSession({ token: LATER_TOKEN, createdAt: clock.now() });
    const off = await api.request('/api/v1/content-analytics/tiktok/disconnect', {
      method: 'POST',
      token: LATER_TOKEN
    });

    expect(off.status).toBe(204);
    expect(tiktok.calls.slice(-2)).toEqual(['/v2/oauth/token/', '/v2/oauth/revoke/']);
    expect(await connectionRow()).toBeNull();
  });
});
