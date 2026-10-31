import { accessTokenSchema, apiErrorSchema, meSchema, postSchema } from '@alexeev/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sha256Hex } from '../../src/platform/security/sha256';
import { APP_ORIGIN, initDataFields, seedBrowserSession, signInitData } from '../helpers/auth';
import { testDb } from '../helpers/db';
import { expectError } from '../helpers/expect-error';
import {
  createApi,
  fakeClock,
  OWNER_ID,
  resetDb,
  seedSession,
  START,
  TEST_BOT_TOKEN,
  type Api
} from '../helpers/harness';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// base64url, 43 characters: the shape of a real token.
const token = (label: string) => label.padEnd(43, '-');
const ACCESS = token('access-one');
const REFRESH = token('refresh-one');

const originHeaders = { origin: APP_ORIGIN };
const cookie = (value: string) => ({ cookie: `refresh_token=${value}` });

async function signIn(api: Api, fields = initDataFields()): Promise<{ accessToken: string; expiresAt: string }> {
  const response = await api.request('/api/v1/auth/telegram', {
    method: 'POST',
    token: null,
    json: { initData: await signInitData(fields) }
  });
  expect(response.status).toBe(200);
  return accessTokenSchema.parse(await response.json());
}

const refresh = (api: Api, init: { token?: string | null; headers?: Record<string, string> } = {}) =>
  api.request('/api/v1/auth/refresh', {
    method: 'POST',
    token: init.token ?? null,
    headers: { ...originHeaders, ...init.headers }
  });

const logout = (api: Api, init: { token?: string | null; headers?: Record<string, string> } = {}) =>
  api.request('/api/v1/auth/logout', {
    method: 'POST',
    token: init.token ?? null,
    headers: { ...originHeaders, ...init.headers }
  });

const me = (api: Api, accessToken: string) => api.request('/api/v1/auth/me', { token: accessToken });

function expectOneWinner(responses: Response[]): void {
  const statuses = responses.map((response) => response.status);
  expect(statuses.filter((status) => status === 200)).toHaveLength(1);
  expect(statuses.filter((status) => status === 401)).toHaveLength(1);
}

async function sessionRows(): Promise<{ id: string; token_hash: string; revoked_at: number | null }[]> {
  const { results } = await testDb()
    .prepare('SELECT id, token_hash, revoked_at FROM sessions')
    .all<{ id: string; token_hash: string; revoked_at: number | null }>();
  return results;
}

beforeEach(resetDb);
afterEach(() => vi.restoreAllMocks());

describe('POST /auth/telegram', () => {
  it('signs the owner in: a parsed access token that works on /auth/me and /posts', async () => {
    const api = createApi();

    const dto = await signIn(api);

    expect(dto.expiresAt).toBe(new Date(START + HOUR).toISOString());
    const profile = meSchema.parse(await (await me(api, dto.accessToken)).json());
    expect(profile).toEqual({ telegramId: OWNER_ID, name: 'Alex Abby' });
    const posts = await api.request('/api/v1/posts', { token: dto.accessToken });
    expect(posts.status).toBe(200);
    const created = await api.request('/api/v1/posts', {
      method: 'POST',
      token: dto.accessToken,
      headers: { 'idempotency-key': 'k1' },
      json: { body: 'From the Mini App' }
    });
    expect(postSchema.parse(await created.json()).title).toBe('From the Mini App');
  });

  it('stores only the token hash, the kind, the cleaned name and the 12 h session end', async () => {
    const api = createApi();
    const dto = await signIn(api, initDataFields({}, { id: Number(OWNER_ID), first_name: 'Al‮ex\u0000' }));

    const row = await testDb()
      .prepare('SELECT token_hash, kind, name, created_at, expires_at, hard_expires_at, telegram_id FROM sessions')
      .first<Record<string, unknown>>();

    expect(row).toEqual({
      token_hash: await sha256Hex(dto.accessToken),
      kind: 'miniapp',
      name: 'Al ex',
      created_at: START,
      expires_at: START + HOUR,
      hard_expires_at: START + 12 * HOUR,
      telegram_id: OWNER_ID
    });
    expect(JSON.stringify(row)).not.toContain(dto.accessToken);
  });

  const unsigned = (fields: Record<string, string>) => new URLSearchParams(fields).toString();
  it.each([
    [
      'a forged hash',
      async () => {
        const params = new URLSearchParams(await signInitData(initDataFields()));
        const hash = params.get('hash') ?? '';
        params.set('hash', `${hash[0] === '0' ? '1' : '0'}${hash.slice(1)}`);
        return params.toString();
      },
      401
    ],
    ['another bot token', async () => signInitData(initDataFields(), '999999:OTHER-BOT-PLACEHOLDER'), 401],
    [
      'a stale auth_date',
      async () => signInitData(initDataFields({ auth_date: String(START / 1000 - 15 * 60 - 1) })),
      401
    ],
    ['a future auth_date', async () => signInitData(initDataFields({ auth_date: String(START / 1000 + 3600) })), 401],
    ['a missing hash', async () => unsigned(initDataFields()), 401],
    ['duplicate keys', async () => `${await signInitData(initDataFields())}&auth_date=1`, 401],
    ['another Telegram user', async () => signInitData(initDataFields({}, { id: 777, first_name: 'Eve' })), 403]
  ])('rejects %s and creates no session', async (_name, build, status) => {
    const api = createApi();

    const response = await api.request('/api/v1/auth/telegram', {
      method: 'POST',
      token: null,
      json: { initData: await build() }
    });

    await expectError(response, status, status === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN');
    expect(await sessionRows()).toEqual([]);
  });

  it('accepts auth_date exactly 15 minutes old', async () => {
    const api = createApi();
    await signIn(api, initDataFields({ auth_date: String(START / 1000 - 15 * 60) }));
  });

  it('answers 403 for a valid signature when OWNER_TELEGRAM_ID is empty, and 401 for a forged one', async () => {
    const api = createApi({ ownerTelegramId: '' });

    const valid = await api.request('/api/v1/auth/telegram', {
      method: 'POST',
      token: null,
      json: { initData: await signInitData(initDataFields()) }
    });
    await expectError(valid, 403, 'FORBIDDEN');

    const forged = await api.request('/api/v1/auth/telegram', {
      method: 'POST',
      token: null,
      json: { initData: await signInitData(initDataFields(), 'other:PLACEHOLDER') }
    });
    await expectError(forged, 401, 'UNAUTHORIZED');
    expect(await sessionRows()).toEqual([]);
  });

  it('answers 503 UNAVAILABLE, not a crash, when the bot token is not set', async () => {
    const api = createApi({ botToken: null });

    const response = await api.request('/api/v1/auth/telegram', {
      method: 'POST',
      token: null,
      json: { initData: await signInitData(initDataFields()) }
    });

    await expectError(response, 503, 'UNAVAILABLE');
  });

  it('validates the body: missing, unknown key, too long and too large', async () => {
    const api = createApi();
    const post = (init: { json?: unknown; body?: string }) =>
      api.request('/api/v1/auth/telegram', {
        method: 'POST',
        token: null,
        headers: init.body === undefined ? {} : { 'content-type': 'application/json' },
        ...init
      });

    await expectError(await post({ json: {} }), 400, 'VALIDATION_ERROR');
    await expectError(await post({ json: { initData: 'x', extra: 1 } }), 400, 'VALIDATION_ERROR');
    await expectError(await post({ json: { initData: 'x'.repeat(4097) } }), 400, 'VALIDATION_ERROR');
    await expectError(await post({ body: JSON.stringify({ initData: 'x'.repeat(20_000) }) }), 413, 'VALIDATION_ERROR');
  });

  it('limits sign-in attempts per client and recovers when the window passes', async () => {
    const clock = fakeClock();
    const api = createApi({ clock });
    const attempt = (ip: string) =>
      api.request('/api/v1/auth/telegram', {
        method: 'POST',
        token: null,
        headers: { 'cf-connecting-ip': ip },
        json: { initData: 'garbage' }
      });

    for (let i = 0; i < 10; i++) expect((await attempt('203.0.113.1')).status).toBe(401);
    const limited = await attempt('203.0.113.1');
    await expectError(limited, 429, 'RATE_LIMIT');
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);

    // Another client is unaffected, so a stranger cannot lock the owner out.
    expect((await attempt('203.0.113.2')).status).toBe(401);

    clock.advance(10 * MINUTE);
    expect((await attempt('203.0.113.1')).status).toBe(401);
  });

  describe('client identity', () => {
    const attemptFrom = (api: Api, ip: string) =>
      api.request('/api/v1/auth/telegram', {
        method: 'POST',
        token: null,
        headers: { 'cf-connecting-ip': ip },
        json: { initData: 'garbage' }
      });
    const rowCount = async () =>
      (await testDb().prepare('SELECT count(*) AS n FROM rate_limits').first<{ n: number }>())?.n;

    it('counts an IPv6 client by /64: rotating the lower bits hits 429 at the 11th request', async () => {
      const api = createApi();
      for (let host = 1; host <= 10; host++) {
        expect((await attemptFrom(api, `2001:db8:1:2::${host.toString(16)}`)).status).toBe(401);
      }
      await expectError(await attemptFrom(api, '2001:db8:1:2::b'), 429, 'RATE_LIMIT');
      await expectError(await attemptFrom(api, '2001:0db8:0001:0002:dead:beef:0:1'), 429, 'RATE_LIMIT');
      expect(await rowCount()).toBe(1);
      // Another /64 is another client.
      expect((await attemptFrom(api, '2001:db8:1:3::1')).status).toBe(401);
    });

    it('counts an IPv4-mapped IPv6 address as the IPv4 address', async () => {
      const api = createApi();
      for (let i = 0; i < 10; i++) expect((await attemptFrom(api, '203.0.113.9')).status).toBe(401);

      await expectError(await attemptFrom(api, '::ffff:203.0.113.9'), 429, 'RATE_LIMIT');
      await expectError(await attemptFrom(api, '::ffff:cb00:7109'), 429, 'RATE_LIMIT');
      expect((await attemptFrom(api, '203.0.113.10')).status).toBe(401);
    });

    it('stops writing to D1 once a client is over the limit', async () => {
      const api = createApi();
      for (let i = 0; i < 11; i++) await attemptFrom(api, '203.0.113.9');
      const countOf = async () =>
        (await testDb().prepare('SELECT count FROM rate_limits').first<{ count: number }>())?.count;
      const atLimit = await countOf();

      for (let i = 0; i < 30; i++) await expectError(await attemptFrom(api, '203.0.113.9'), 429, 'RATE_LIMIT');

      expect(await countOf()).toBe(atLimit);
      expect(atLimit).toBe(11);
    });
  });

  it('counts parallel attempts exactly', async () => {
    const api = createApi();
    const responses = await Promise.all(
      Array.from({ length: 14 }, () =>
        api.request('/api/v1/auth/telegram', { method: 'POST', token: null, json: { initData: 'garbage' } })
      )
    );
    expect(responses.filter((response) => response.status === 429)).toHaveLength(4);
  });
});

describe('GET /auth/me and the guard', () => {
  it('requires a Bearer token', async () => {
    await expectError(await createApi().request('/api/v1/auth/me', { token: null }), 401, 'UNAUTHORIZED');
  });

  it('keeps every other auth path behind the guard, including a wrong method on a public one', async () => {
    const api = createApi();
    await expectError(await api.request('/api/v1/auth/telegram', { token: null }), 401, 'UNAUTHORIZED');
    await expectError(await api.request('/api/v1/auth/oidc/start', { token: null }), 401, 'UNAUTHORIZED');
  });

  it('answers 403 for a session of another Telegram user', async () => {
    await seedSession({ token: ACCESS, telegramId: '777' });
    await expectError(await createApi().request('/api/v1/auth/me', { token: ACCESS }), 403, 'FORBIDDEN');
  });
});

describe('POST /auth/refresh with a Mini App Bearer token', () => {
  it('issues a new token and revokes the old one', async () => {
    const clock = fakeClock();
    const api = createApi({ clock });
    const first = await signIn(api);
    clock.advance(30 * MINUTE);

    const response = await refresh(api, { token: first.accessToken });

    expect(response.status).toBe(200);
    const second = accessTokenSchema.parse(await response.json());
    expect(second.accessToken).not.toBe(first.accessToken);
    expect(second.expiresAt).toBe(new Date(START + 90 * MINUTE).toISOString());
    expect(response.headers.get('set-cookie')).toBeNull();
    await expectError(await me(api, first.accessToken), 401, 'UNAUTHORIZED');
    expect((await me(api, second.accessToken)).status).toBe(200);
    expect(await sessionRows()).toHaveLength(1);
  });

  it('never moves the session past 12 hours, then refuses', async () => {
    const clock = fakeClock();
    const api = createApi({ clock });
    let current = (await signIn(api)).accessToken;

    for (let minutes = 50; minutes <= 700; minutes += 50) {
      clock.set(START + minutes * MINUTE);
      const dto = accessTokenSchema.parse(await (await refresh(api, { token: current })).json());
      current = dto.accessToken;
      expect(Date.parse(dto.expiresAt)).toBeLessThanOrEqual(START + 12 * HOUR);
    }
    clock.set(START + 710 * MINUTE);
    const last = accessTokenSchema.parse(await (await refresh(api, { token: current })).json());
    expect(last.expiresAt).toBe(new Date(START + 12 * HOUR).toISOString());

    clock.set(START + 12 * HOUR);
    await expectError(await refresh(api, { token: last.accessToken }), 401, 'UNAUTHORIZED');
    await expectError(await me(api, last.accessToken), 401, 'UNAUTHORIZED');
  });

  it('refuses an expired token', async () => {
    const clock = fakeClock();
    const api = createApi({ clock });
    const dto = await signIn(api);
    clock.advance(HOUR);
    await expectError(await refresh(api, { token: dto.accessToken }), 401, 'UNAUTHORIZED');
  });

  it('lets exactly one of two parallel refreshes with the same token win', async () => {
    const api = createApi();
    const dto = await signIn(api);

    const responses = await Promise.all([
      refresh(api, { token: dto.accessToken }),
      refresh(api, { token: dto.accessToken })
    ]);

    expectOneWinner(responses);
    expect(await sessionRows()).toHaveLength(1);
  });

  it.each([
    ['a missing Origin', {}],
    ['a foreign Origin', { origin: 'https://evil.example' }],
    ['the null Origin', { origin: 'null' }],
    ['a look-alike Origin', { origin: 'http://localhost.evil.example' }]
  ])('answers 403 for %s and leaves the token usable', async (_name, headers) => {
    const api = createApi();
    const dto = await signIn(api);

    const response = await api.request('/api/v1/auth/refresh', {
      method: 'POST',
      token: dto.accessToken,
      headers
    });

    await expectError(response, 403, 'FORBIDDEN');
    expect((await me(api, dto.accessToken)).status).toBe(200);
  });

  it('answers 401 without any credential and for an unknown token', async () => {
    const api = createApi();
    await expectError(await refresh(api), 401, 'UNAUTHORIZED');
    await expectError(await refresh(api, { token: 'unknown' }), 401, 'UNAUTHORIZED');
  });

  it('answers 403 for a session of another Telegram user', async () => {
    await seedSession({ token: ACCESS, telegramId: '777', kind: 'miniapp' });
    await expectError(await refresh(createApi(), { token: ACCESS }), 403, 'FORBIDDEN');
  });

  it('refuses a browser session without the cookie, and a session with no hard end', async () => {
    const api = createApi();
    await seedBrowserSession({ accessToken: ACCESS, refreshToken: REFRESH });
    await expectError(await refresh(api, { token: ACCESS }), 401, 'UNAUTHORIZED');

    await seedSession({ token: token('seeded'), kind: 'miniapp' });
    await expectError(await refresh(api, { token: token('seeded') }), 401, 'UNAUTHORIZED');
  });

  it('limits refresh attempts', async () => {
    const api = createApi();
    for (let i = 0; i < 120; i++) expect((await refresh(api)).status).toBe(401);
    await expectError(await refresh(api), 429, 'RATE_LIMIT');
  });
});

describe('POST /auth/refresh with the browser refresh cookie', () => {
  it('rotates the cookie and the access token on every use', async () => {
    const clock = fakeClock();
    const api = createApi({ clock });
    await seedBrowserSession({ accessToken: ACCESS, refreshToken: REFRESH });
    let currentRefresh = REFRESH;
    let currentAccess = ACCESS;

    for (let step = 1; step <= 3; step++) {
      clock.advance(10 * MINUTE);
      const response = await refresh(api, { headers: cookie(currentRefresh) });
      expect(response.status).toBe(200);
      const dto = accessTokenSchema.parse(await response.json());
      const setCookie = response.headers.get('set-cookie') ?? '';
      const nextRefresh = /refresh_token=([^;]+)/.exec(setCookie)?.[1] ?? '';
      expect(nextRefresh).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(nextRefresh).not.toBe(currentRefresh);
      expect(setCookie).toContain('HttpOnly');
      expect(setCookie).toContain('Secure');
      expect(setCookie).toContain('SameSite=Lax');
      expect(setCookie).toContain('Path=/api/v1/auth');
      expect(setCookie).toContain(`Max-Age=${30 * 24 * 60 * 60}`);
      expect(dto.expiresAt).toBe(new Date(clock.now() + HOUR).toISOString());
      await expectError(await me(api, currentAccess), 401, 'UNAUTHORIZED');
      expect(meSchema.parse(await (await me(api, dto.accessToken)).json()).name).toBe('Browser Owner');
      currentRefresh = nextRefresh;
      currentAccess = dto.accessToken;
    }

    const stored = await testDb().prepare('SELECT count(*) AS n FROM refresh_tokens').first<{ n: number }>();
    expect(stored?.n).toBe(4);
  });

  it('works when the access token has expired, and prefers the cookie to a stale Bearer', async () => {
    const clock = fakeClock();
    const api = createApi({ clock });
    await seedBrowserSession({ accessToken: ACCESS, refreshToken: REFRESH });
    clock.advance(2 * HOUR);

    const response = await refresh(api, { token: ACCESS, headers: cookie(REFRESH) });

    expect(response.status).toBe(200);
  });

  it('revokes the whole session when an already rotated token is presented', async () => {
    const api = createApi();
    await seedBrowserSession({ accessToken: ACCESS, refreshToken: REFRESH });
    const logSpy = vi.spyOn(console, 'log');
    const rotated = await refresh(api, { headers: cookie(REFRESH) });
    const newAccess = accessTokenSchema.parse(await rotated.json()).accessToken;
    const newRefresh = /refresh_token=([^;]+)/.exec(rotated.headers.get('set-cookie') ?? '')?.[1] ?? '';

    const replay = await refresh(api, { headers: cookie(REFRESH) });

    await expectError(replay, 401, 'UNAUTHORIZED');
    expect(replay.headers.get('set-cookie')).toContain('Max-Age=0');
    // The thief and the owner both lose access: the successor token and the new access token die.
    await expectError(await refresh(api, { headers: cookie(newRefresh) }), 401, 'UNAUTHORIZED');
    await expectError(await me(api, newAccess), 401, 'UNAUTHORIZED');
    expect((await sessionRows()).every((row) => row.revoked_at !== null)).toBe(true);
    const logged = logSpy.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(logged).toContain('refresh_token_reuse');
    expect(logged).not.toContain(REFRESH);
    expect(logged).not.toContain(newRefresh);
  });

  it('lets exactly one parallel refresh win and treats the loser as reuse', async () => {
    const api = createApi();
    await seedBrowserSession({ accessToken: ACCESS, refreshToken: REFRESH });

    const responses = await Promise.all([
      refresh(api, { headers: cookie(REFRESH) }),
      refresh(api, { headers: cookie(REFRESH) })
    ]);

    expectOneWinner(responses);
    expect((await sessionRows()).every((row) => row.revoked_at !== null)).toBe(true);
  });

  it('refuses an expired refresh token, a revoked session and a malformed cookie', async () => {
    const clock = fakeClock();
    const api = createApi({ clock });
    await seedBrowserSession({ accessToken: ACCESS, refreshToken: REFRESH });
    clock.advance(30 * DAY);
    await expectError(await refresh(api, { headers: cookie(REFRESH) }), 401, 'UNAUTHORIZED');

    await resetDb();
    clock.set(START);
    const sessionId = await seedBrowserSession({ accessToken: ACCESS, refreshToken: REFRESH });
    await testDb().prepare('UPDATE sessions SET revoked_at = ?1 WHERE id = ?2').bind(START, sessionId).run();
    await expectError(await refresh(api, { headers: cookie(REFRESH) }), 401, 'UNAUTHORIZED');

    await expectError(await refresh(api, { headers: cookie('not-a-token') }), 401, 'UNAUTHORIZED');
    await expectError(await refresh(api, { headers: cookie(token('unknown')) }), 401, 'UNAUTHORIZED');
  });

  it('never extends a browser session past its hard end', async () => {
    const clock = fakeClock();
    const api = createApi({ clock });
    await seedBrowserSession({ accessToken: ACCESS, refreshToken: REFRESH, hardExpiresAt: START + 20 * MINUTE });
    clock.advance(10 * MINUTE);

    const response = await refresh(api, { headers: cookie(REFRESH) });

    expect(accessTokenSchema.parse(await response.json()).expiresAt).toBe(new Date(START + 20 * MINUTE).toISOString());
    expect(response.headers.get('set-cookie')).toContain(`Max-Age=${10 * 60}`);
    const next = /refresh_token=([^;]+)/.exec(response.headers.get('set-cookie') ?? '')?.[1] ?? '';
    clock.set(START + 20 * MINUTE);
    await expectError(await refresh(api, { headers: cookie(next) }), 401, 'UNAUTHORIZED');
  });

  it('answers 403 for another Telegram user and for a foreign Origin, leaving the cookie valid', async () => {
    const api = createApi();
    await seedBrowserSession({ accessToken: ACCESS, refreshToken: REFRESH });
    await expectError(
      await api.request('/api/v1/auth/refresh', {
        method: 'POST',
        token: null,
        headers: { origin: 'https://evil.example', ...cookie(REFRESH) }
      }),
      403,
      'FORBIDDEN'
    );
    await expectError(
      await api.request('/api/v1/auth/refresh', { method: 'POST', token: null, headers: cookie(REFRESH) }),
      403,
      'FORBIDDEN'
    );
    expect((await refresh(api, { headers: cookie(REFRESH) })).status).toBe(200);

    await resetDb();
    await seedBrowserSession({ accessToken: ACCESS, refreshToken: REFRESH, telegramId: '777' });
    await expectError(await refresh(api, { headers: cookie(REFRESH) }), 403, 'FORBIDDEN');
  });
});

describe('POST /auth/logout', () => {
  it('revokes a Mini App session by its Bearer token and answers 204', async () => {
    const api = createApi();
    const dto = await signIn(api);

    const response = await logout(api, { token: dto.accessToken });

    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
    expect(response.headers.get('set-cookie')).toContain('Path=/api/v1/auth');
    await expectError(await me(api, dto.accessToken), 401, 'UNAUTHORIZED');
    await expectError(await logout(api, { token: dto.accessToken }), 401, 'UNAUTHORIZED');
  });

  it('revokes a browser session by the cookie alone, access token expired', async () => {
    const clock = fakeClock();
    const api = createApi({ clock });
    await seedBrowserSession({ accessToken: ACCESS, refreshToken: REFRESH });
    clock.advance(2 * HOUR);

    const response = await logout(api, { headers: cookie(REFRESH) });

    expect(response.status).toBe(204);
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
    await expectError(await refresh(api, { headers: cookie(REFRESH) }), 401, 'UNAUTHORIZED');
  });

  it('accepts Bearer and cookie together', async () => {
    const api = createApi();
    await seedBrowserSession({ accessToken: ACCESS, refreshToken: REFRESH });

    expect((await logout(api, { token: ACCESS, headers: cookie(REFRESH) })).status).toBe(204);
    await expectError(await me(api, ACCESS), 401, 'UNAUTHORIZED');
  });

  it('signs out with the cookie even when the Bearer token is unknown', async () => {
    const api = createApi();
    await seedBrowserSession({ accessToken: ACCESS, refreshToken: REFRESH });

    expect((await logout(api, { token: 'stale', headers: cookie(REFRESH) })).status).toBe(204);
    await expectError(await me(api, ACCESS), 401, 'UNAUTHORIZED');
  });

  it('answers 401 without a live credential, still clearing the cookie', async () => {
    const api = createApi();
    const response = await logout(api, { headers: cookie(token('unknown')) });

    await expectError(response, 401, 'UNAUTHORIZED');
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
  });

  it('answers 403 for a missing or foreign Origin and keeps the session', async () => {
    const api = createApi();
    const dto = await signIn(api);
    for (const origin of [undefined, 'https://evil.example']) {
      const response = await api.request('/api/v1/auth/logout', {
        method: 'POST',
        token: dto.accessToken,
        headers: origin === undefined ? {} : { origin }
      });
      await expectError(response, 403, 'FORBIDDEN');
      expect(response.headers.get('set-cookie')).toBeNull();
    }
    expect((await me(api, dto.accessToken)).status).toBe(200);
  });
});

describe('response headers', () => {
  it('sets nosniff, referrer-policy and no-store on auth responses, errors included', async () => {
    const api = createApi();
    const dto = await signIn(api);
    const responses = [
      await me(api, dto.accessToken),
      await me(api, 'unknown'),
      await refresh(api),
      await api.request('/api/v1/auth/telegram', { method: 'POST', token: null, json: {} })
    ];

    for (const response of responses) {
      expect(response.headers.get('x-content-type-options')).toBe('nosniff');
      expect(response.headers.get('referrer-policy')).toBe('no-referrer');
      expect(response.headers.get('cache-control')).toBe('no-store');
    }
  });

  it('keeps the health probe cacheable by default but still nosniff', async () => {
    const response = await createApi().request('/api/v1/health', { token: null });
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('cache-control')).toBeNull();
  });

  it('parses every error with the contract schema', async () => {
    const api = createApi();
    const response = await refresh(api);
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe('UNAUTHORIZED');
  });
});

describe('logs', () => {
  it('never contain initData, tokens, cookies or hashes', async () => {
    const logSpy = vi.spyOn(console, 'log');
    const api = createApi();
    const initData = await signInitData(initDataFields());
    const signedIn = accessTokenSchema.parse(
      await (await api.request('/api/v1/auth/telegram', { method: 'POST', token: null, json: { initData } })).json()
    );
    const refreshed = accessTokenSchema.parse(await (await refresh(api, { token: signedIn.accessToken })).json());
    await seedBrowserSession({ accessToken: ACCESS, refreshToken: REFRESH });
    await refresh(api, { headers: cookie(REFRESH) });
    await refresh(api, { headers: cookie(REFRESH) });
    await logout(api, { token: refreshed.accessToken });

    const logged = logSpy.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(logged.length).toBeGreaterThan(0);
    const hash = new URLSearchParams(initData).get('hash') ?? '';
    for (const secret of [
      initData,
      hash,
      TEST_BOT_TOKEN,
      signedIn.accessToken,
      refreshed.accessToken,
      REFRESH,
      ACCESS
    ]) {
      expect(logged).not.toContain(secret);
    }
    expect(logged).not.toContain(await sha256Hex(refreshed.accessToken));
    expect(logged).not.toContain('refresh_token=');
  });
});

describe('query plans', () => {
  const plan = async (sql: string, ...bindings: unknown[]) => {
    const { results } = await testDb()
      .prepare(`EXPLAIN QUERY PLAN ${sql}`)
      .bind(...bindings)
      .all<{ detail: string }>();
    return results.map((row) => row.detail).join('\n');
  };

  it('uses an index for every new lookup and cleanup', async () => {
    const expectations: [string, unknown[]][] = [
      ['SELECT id FROM sessions WHERE token_hash = ?1 AND revoked_at IS NULL AND expires_at > ?2', ['h', 1]],
      [
        `SELECT r.session_id FROM refresh_tokens r JOIN sessions s ON s.id = r.session_id WHERE r.token_hash = ?1`,
        ['h']
      ],
      ['DELETE FROM refresh_tokens WHERE session_id = ?1 AND expires_at <= ?2', ['s', 1]],
      ['SELECT bucket FROM rate_limits WHERE window_start < ?1 LIMIT 20', [1]]
    ];
    for (const [sql, bindings] of expectations) {
      const detail = await plan(sql, ...bindings);
      expect(detail, sql).toMatch(/USING (COVERING )?INDEX|USING INTEGER PRIMARY KEY/);
      expect(detail, sql).not.toMatch(/SCAN (sessions|refresh_tokens|rate_limits)(?! USING)/);
    }
  });
});
