import { accessTokenSchema, meSchema } from '@alexeev/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sha256Hex } from '../../src/platform/security/sha256';
import { APP_ORIGIN, signWidgetData, widgetFields, type WidgetFields } from '../helpers/auth';
import { testDb } from '../helpers/db';
import { expectError } from '../helpers/expect-error';
import { createApi, fakeClock, OWNER_ID, resetDb, START, type Api } from '../helpers/harness';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const PATH = '/api/v1/auth/telegram-widget';

const widgetSignIn = (api: Api, json: unknown, headers: Record<string, string> = { origin: APP_ORIGIN }) =>
  api.request(PATH, { method: 'POST', token: null, headers, json });

async function count(table: string): Promise<number> {
  return (await testDb().prepare(`SELECT count(*) AS n FROM ${table}`).first<{ n: number }>())?.n ?? -1;
}

function refreshCookieOf(response: Response): string {
  const match = /^refresh_token=([^;]+);/.exec(response.headers.get('set-cookie') ?? '');
  if (match?.[1] === undefined) throw new Error('no refresh cookie');
  return match[1];
}

beforeEach(resetDb);
afterEach(() => vi.restoreAllMocks());

describe('POST /auth/telegram-widget', () => {
  it('signs the owner in: parsed token, the 3A cookie, no-store, then /me and a cookie refresh work', async () => {
    const api = createApi();

    const response = await widgetSignIn(api, await signWidgetData(widgetFields()));

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const dto = accessTokenSchema.parse(await response.json());
    expect(dto.expiresAt).toBe(new Date(START + HOUR).toISOString());

    const setCookie = response.headers.get('set-cookie') ?? '';
    expect(setCookie).toMatch(/^refresh_token=[A-Za-z0-9_-]{43};/);
    for (const attribute of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/api/v1/auth', `Max-Age=${30 * 24 * 3600}`]) {
      expect(setCookie).toContain(attribute);
    }

    const profile = meSchema.parse(await (await api.request('/api/v1/auth/me', { token: dto.accessToken })).json());
    expect(profile).toEqual({ telegramId: OWNER_ID, name: 'Alex Abby' });

    api.clock.advance(10 * MINUTE);
    const refreshed = await api.request('/api/v1/auth/refresh', {
      method: 'POST',
      token: null,
      headers: { origin: APP_ORIGIN, cookie: `refresh_token=${refreshCookieOf(response)}` }
    });
    expect(refreshed.status).toBe(200);
    const next = accessTokenSchema.parse(await refreshed.json());
    expect(next.accessToken).not.toBe(dto.accessToken);
    expect(refreshCookieOf(refreshed)).not.toBe(refreshCookieOf(response));
    expect((await api.request('/api/v1/auth/me', { token: next.accessToken })).status).toBe(200);
    expect((await api.request('/api/v1/auth/me', { token: dto.accessToken })).status).toBe(401);
  });

  it('stores hashes only, a browser session ending in 90 days, a 30-day refresh token and the consumed signature', async () => {
    const api = createApi();
    const signed = await signWidgetData(widgetFields({ first_name: 'Al‮ex\u0000' }));

    const response = await widgetSignIn(api, signed);
    const dto = accessTokenSchema.parse(await response.json());

    const session = await testDb()
      .prepare('SELECT id, token_hash, kind, name, created_at, expires_at, hard_expires_at, telegram_id FROM sessions')
      .first<Record<string, unknown>>();
    expect(session).toMatchObject({
      token_hash: await sha256Hex(dto.accessToken),
      kind: 'browser',
      name: 'Al ex Abby',
      created_at: START,
      expires_at: START + HOUR,
      hard_expires_at: START + 90 * DAY,
      telegram_id: OWNER_ID
    });
    const refresh = await testDb()
      .prepare('SELECT token_hash, session_id, created_at, expires_at, used_at FROM refresh_tokens')
      .first<Record<string, unknown>>();
    expect(refresh).toEqual({
      token_hash: await sha256Hex(refreshCookieOf(response)),
      session_id: session?.id,
      created_at: START,
      expires_at: START + 30 * DAY,
      used_at: null
    });
    const claim = await testDb()
      .prepare('SELECT hash_sha256, session_id, created_at, expires_at FROM widget_sign_ins')
      .first<Record<string, unknown>>();
    expect(claim).toEqual({
      hash_sha256: await sha256Hex(String(signed.hash)),
      session_id: session?.id,
      created_at: START,
      expires_at: START + 30 * MINUTE
    });
    expect(JSON.stringify([session, refresh, claim])).not.toContain(String(signed.hash));
    expect(JSON.stringify([session, refresh, claim])).not.toContain(dto.accessToken);
  });

  it('accepts what the widget really sends, including photo_url and an extra field covered by the hash', async () => {
    const api = createApi();
    const fields = widgetFields({ photo_url: 'https://t.me/i/userpic/320/alex.jpg', future_flag: 'yes', level: 3 });

    expect((await widgetSignIn(api, await signWidgetData(fields))).status).toBe(200);
  });

  it('accepts an auth_date exactly 15 minutes old and one 60 s ahead', async () => {
    for (const authDate of [START / 1000 - 15 * 60, START / 1000 + 60]) {
      await resetDb();
      const response = await widgetSignIn(createApi(), await signWidgetData(widgetFields({ auth_date: authDate })));
      expect(response.status).toBe(200);
    }
  });

  const bad = {
    'a forged hash': async () => {
      const signed = await signWidgetData(widgetFields());
      const hash = String(signed.hash);
      return { ...signed, hash: `${hash[0] === '0' ? '1' : '0'}${hash.slice(1)}` };
    },
    'another bot token': () => signWidgetData(widgetFields(), { botToken: '999999:OTHER-BOT-PLACEHOLDER' }),
    'a stale auth_date': () => signWidgetData(widgetFields({ auth_date: START / 1000 - 15 * 60 - 1 })),
    'a future auth_date': () => signWidgetData(widgetFields({ auth_date: START / 1000 + 61 })),
    'a changed field after signing': async () => ({ ...(await signWidgetData(widgetFields())), first_name: 'Eve' }),
    'an extra field that is not in the hash': () =>
      signWidgetData(widgetFields(), { unsignedExtra: { injected: 'x' } }),
    'a field that is hashed but renamed on the wire': async () => {
      const { username, ...rest } = await signWidgetData(widgetFields());
      return { ...rest, user_name: username };
    },
    'a field name that could blur the data-check-string': () =>
      signWidgetData(widgetFields({ 'a=b': 'c' }), { omitFromHash: [] })
  };
  it.each(Object.entries(bad))('rejects %s with the one generic 401 and creates nothing', async (_name, build) => {
    const api = createApi();

    const response = await widgetSignIn(api, await build());

    await expectError(response, 401, 'UNAUTHORIZED');
    expect(await count('sessions')).toBe(0);
    expect(await count('refresh_tokens')).toBe(0);
    expect(await count('widget_sign_ins')).toBe(0);
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('gives the same message for every signature, freshness and replay failure', async () => {
    const api = createApi();
    const messages = new Set<string>();
    const used = await signWidgetData(widgetFields());
    expect((await widgetSignIn(api, used)).status).toBe(200);
    for (const payload of [
      await bad['a forged hash'](),
      await bad['a stale auth_date'](),
      await bad['a future auth_date'](),
      used
    ]) {
      const body = (await (await widgetSignIn(api, payload)).json()) as { error: { message: string } };
      messages.add(body.error.message);
    }
    expect(messages.size).toBe(1);
  });

  it('answers 400 for a missing required field, a bad type, too many fields', async () => {
    const api = createApi();
    const signed = await signWidgetData(widgetFields());
    const { id, ...withoutId } = signed;
    const { hash, ...withoutHash } = signed;
    const tooMany: WidgetFields = { ...signed };
    for (let i = 0; i < 12; i++) tooMany[`extra_${i}`] = 'x';

    expect(id).toBeDefined();
    expect(hash).toBeDefined();
    await expectError(await widgetSignIn(api, withoutId), 400, 'VALIDATION_ERROR');
    await expectError(await widgetSignIn(api, withoutHash), 400, 'VALIDATION_ERROR');
    await expectError(await widgetSignIn(api, { ...signed, id: String(signed.id) }), 400, 'VALIDATION_ERROR');
    await expectError(await widgetSignIn(api, { ...signed, hash: 'A'.repeat(64) }), 400, 'VALIDATION_ERROR');
    await expectError(await widgetSignIn(api, { ...signed, first_name: 'x'.repeat(257) }), 400, 'VALIDATION_ERROR');
    await expectError(await widgetSignIn(api, tooMany), 400, 'VALIDATION_ERROR');
    await expectError(await widgetSignIn(api, { ...signed, nested: { a: 1 } }), 400, 'VALIDATION_ERROR');
    expect(await count('sessions')).toBe(0);
  });

  describe('raw bodies that a parsed object would hide', () => {
    const rawSignIn = (api: Api, body: string) =>
      api.request(PATH, {
        method: 'POST',
        token: null,
        headers: { origin: APP_ORIGIN, 'content-type': 'application/json' },
        body
      });
    const expectNothingStored = async () => {
      expect(await count('sessions')).toBe(0);
      expect(await count('refresh_tokens')).toBe(0);
      expect(await count('widget_sign_ins')).toBe(0);
    };

    it('refuses an own __proto__ key that is received but would never be hashed', async () => {
      const api = createApi();
      const signed = JSON.stringify(await signWidgetData(widgetFields()));

      const response = await rawSignIn(api, `${signed.slice(0, -1)},"__proto__":{"last_name":"evil"}}`);

      await expectError(response, 400, 'VALIDATION_ERROR');
      await expectNothingStored();
    });

    it.each([
      ['a known field', { first_name: 'A\uFFFD' }],
      ['an extra field', { note: 'x\uFFFDy' }]
    ])('refuses a lone surrogate in %s that was signed as U+FFFD', async (_name, extra) => {
      const api = createApi();
      const signed = JSON.stringify(await signWidgetData(widgetFields(extra)));
      expect(signed).toContain('\uFFFD');

      // The signature covers U+FFFD, which is what UTF-8 turns a lone surrogate into.
      const sent = signed.replace('\uFFFD', String.raw`\ud800`);
      expect(sent).not.toBe(signed);

      await expectError(await rawSignIn(api, sent), 400, 'VALIDATION_ERROR');
      await expectNothingStored();
    });
  });

  it('signs in an owner whose Telegram id has 16 digits', async () => {
    const api = createApi({ ownerTelegramId: '1234567890123456' });

    const response = await widgetSignIn(api, await signWidgetData(widgetFields({ id: 1_234_567_890_123_456 })));

    expect(response.status).toBe(200);
    const dto = accessTokenSchema.parse(await response.json());
    const me = await api.request('/api/v1/auth/me', { token: dto.accessToken });
    expect(meSchema.parse(await me.json()).telegramId).toBe('1234567890123456');
  });

  it('answers 413 for an oversized body', async () => {
    const api = createApi();
    const response = await api.request(PATH, {
      method: 'POST',
      token: null,
      headers: { origin: APP_ORIGIN, 'content-type': 'application/json' },
      body: JSON.stringify({ ...(await signWidgetData(widgetFields())), pad: 'x'.repeat(20_000) })
    });
    await expectError(response, 413, 'VALIDATION_ERROR');
  });

  it('refuses a reused signature with 401 and creates no second session', async () => {
    const api = createApi();
    const signed = await signWidgetData(widgetFields());

    expect((await widgetSignIn(api, signed)).status).toBe(200);
    const replay = await widgetSignIn(api, signed);

    await expectError(replay, 401, 'UNAUTHORIZED');
    expect(replay.headers.get('set-cookie')).toBeNull();
    expect(await count('sessions')).toBe(1);
    expect(await count('refresh_tokens')).toBe(1);
    expect(await count('widget_sign_ins')).toBe(1);
  });

  it('lets exactly one of parallel replays win and leaves one session and one refresh token', async () => {
    const api = createApi();
    const signed = await signWidgetData(widgetFields());

    const responses = await Promise.all(Array.from({ length: 5 }, () => widgetSignIn(api, signed)));

    const statuses = responses.map((response) => response.status);
    expect(statuses.filter((status) => status === 200)).toHaveLength(1);
    expect(statuses.filter((status) => status === 401)).toHaveLength(4);
    expect(await count('sessions')).toBe(1);
    expect(await count('refresh_tokens')).toBe(1);
    expect(await count('widget_sign_ins')).toBe(1);
  });

  it('keeps remembering a signature for as long as it could still pass freshness', async () => {
    const api = createApi();
    const signed = await signWidgetData(widgetFields({ auth_date: START / 1000 + 60 }));
    expect((await widgetSignIn(api, signed)).status).toBe(200);

    // The latest moment the payload is still fresh: 15 minutes after its auth_date.
    api.clock.set(START + 60_000 + 15 * MINUTE);
    await expectError(await widgetSignIn(api, signed), 401, 'UNAUTHORIZED');
    expect(await count('sessions')).toBe(1);
    api.clock.advance(1000);
    await expectError(await widgetSignIn(api, signed), 401, 'UNAUTHORIZED');
  });

  it('purges expired signatures in bounded steps', async () => {
    const api = createApi();
    const db = testDb();
    await db.batch(
      Array.from({ length: 25 }, (_value, i) =>
        db
          .prepare(
            'INSERT INTO widget_sign_ins (hash_sha256, session_id, created_at, expires_at) VALUES (?1, ?2, ?3, ?4)'
          )
          .bind(`${i}`.padStart(64, '0'), 'old', START - 2 * HOUR, START - HOUR)
      )
    );
    const live = 'f'.repeat(64);
    await db
      .prepare('INSERT INTO widget_sign_ins (hash_sha256, session_id, created_at, expires_at) VALUES (?1, ?2, ?3, ?4)')
      .bind(live, 'live', START - MINUTE, START + HOUR)
      .run();

    expect((await widgetSignIn(api, await signWidgetData(widgetFields()))).status).toBe(200);

    // 20 expired rows removed, 5 expired left for the next sign-in, the live one and the new one kept.
    expect(await count('widget_sign_ins')).toBe(7);
    expect(
      await db.prepare('SELECT 1 AS x FROM widget_sign_ins WHERE hash_sha256 = ?1').bind(live).first()
    ).not.toBeNull();
  });

  it('answers 403 for a valid signature of another Telegram user and consumes nothing', async () => {
    const api = createApi();

    const foreign = await widgetSignIn(api, await signWidgetData(widgetFields({ id: 777, first_name: 'Eve' })));
    await expectError(foreign, 403, 'FORBIDDEN');
    expect(await count('sessions')).toBe(0);
    expect(await count('widget_sign_ins')).toBe(0);
  });

  it('lets nobody in when OWNER_TELEGRAM_ID is empty', async () => {
    const api = createApi({ ownerTelegramId: '' });

    await expectError(await widgetSignIn(api, await signWidgetData(widgetFields())), 403, 'FORBIDDEN');
    await expectError(
      await widgetSignIn(api, await signWidgetData(widgetFields(), { botToken: 'other:PLACEHOLDER' })),
      401,
      'UNAUTHORIZED'
    );
    expect(await count('sessions')).toBe(0);
  });

  it('answers 503 UNAVAILABLE when the bot token is not set', async () => {
    const api = createApi({ botToken: null });

    await expectError(await widgetSignIn(api, await signWidgetData(widgetFields())), 503, 'UNAVAILABLE');
    expect(await count('sessions')).toBe(0);
  });

  it.each([
    ['a missing Origin', {}],
    ['a foreign Origin', { origin: 'https://evil.example' }],
    ['the null Origin', { origin: 'null' }],
    ['a look-alike Origin', { origin: 'http://localhost.evil.example' }]
  ])('answers 403 for %s and creates nothing', async (_name, headers) => {
    const api = createApi();

    const response = await widgetSignIn(api, await signWidgetData(widgetFields()), headers);

    await expectError(response, 403, 'FORBIDDEN');
    expect(await count('sessions')).toBe(0);
    expect(await count('widget_sign_ins')).toBe(0);
    expect(await count('rate_limits')).toBe(0);
  });

  it('limits attempts per client, sharing the Mini App sign-in bucket, and recovers with the window', async () => {
    const clock = fakeClock();
    const api = createApi({ clock });
    const attempt = (ip: string) =>
      widgetSignIn(api, { ...widgetFields(), hash: '0'.repeat(64) }, { origin: APP_ORIGIN, 'cf-connecting-ip': ip });
    // Five Mini App attempts and five widget attempts fill the same bucket of 10.
    for (let i = 0; i < 5; i++) {
      await api.request('/api/v1/auth/telegram', {
        method: 'POST',
        token: null,
        headers: { 'cf-connecting-ip': '203.0.113.1' },
        json: { initData: 'garbage' }
      });
      expect((await attempt('203.0.113.1')).status).toBe(401);
    }

    const limited = await attempt('203.0.113.1');
    await expectError(limited, 429, 'RATE_LIMIT');
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
    expect((await attempt('203.0.113.2')).status).toBe(401);

    clock.advance(10 * MINUTE);
    expect((await attempt('203.0.113.1')).status).toBe(401);
  });

  it('writes nothing sensitive to the logs, on success and on failure', async () => {
    const lines: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((line: unknown) => void lines.push(String(line)));
    vi.spyOn(console, 'warn').mockImplementation((line: unknown) => void lines.push(String(line)));
    vi.spyOn(console, 'error').mockImplementation((line: unknown) => void lines.push(String(line)));
    const api = createApi();
    const signed = await signWidgetData(widgetFields({ first_name: 'Zebediah', username: 'zeb_secret' }));

    const ok = await widgetSignIn(api, signed);
    const replay = await widgetSignIn(api, signed);
    const dto = accessTokenSchema.parse(await ok.json());

    expect(replay.status).toBe(401);
    const everything = lines.join('\n');
    expect(everything).toContain('POST /api/v1/auth/telegram-widget');
    for (const secret of [
      String(signed.hash),
      dto.accessToken,
      refreshCookieOf(ok),
      'Zebediah',
      'zeb_secret',
      '123456:TEST-BOT-TOKEN-PLACEHOLDER'
    ]) {
      expect(everything).not.toContain(secret);
    }
  });
});
