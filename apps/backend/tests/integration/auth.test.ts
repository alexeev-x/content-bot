import { apiErrorSchema, healthSchema } from '@alexeev/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app/create-app';
import type { AppEnv } from '../../src/app/env';
import { sha256Hex } from '../../src/platform/security/sha256';
import { createApi, fakeClock, OWNER_TOKEN, resetDb, seedSession, START } from '../helpers/harness';

// Any guarded route works to probe the guard; the list is the cheapest read.
const PROBE = '/api/v1/posts';

async function expectError(response: Response, status: number, code: string) {
  expect(response.status).toBe(status);
  const body = apiErrorSchema.parse(await response.json());
  expect(body.error.code).toBe(code);
  expect(body.error.requestId).toBe(response.headers.get('x-request-id'));
}

beforeEach(resetDb);
afterEach(() => vi.restoreAllMocks());

describe('owner session guard', () => {
  it('keeps /api/v1/health public', async () => {
    const response = await createApi().request('/api/v1/health', { token: null });

    expect(response.status).toBe(200);
    expect(healthSchema.parse(await response.json()).status).toBe('ok');
  });

  it('accepts a valid owner session', async () => {
    await seedSession({ token: OWNER_TOKEN });

    expect((await createApi().request(PROBE)).status).toBe(200);
  });

  it('accepts the Bearer scheme in any letter case', async () => {
    await seedSession({ token: OWNER_TOKEN });

    const response = await createApi().request(PROBE, {
      token: null,
      headers: { authorization: `bearer ${OWNER_TOKEN}` }
    });

    expect(response.status).toBe(200);
  });

  it('answers 401 without a token', async () => {
    await expectError(await createApi().request(PROBE, { token: null }), 401, 'UNAUTHORIZED');
  });

  it('answers 401 for a malformed Authorization header', async () => {
    const api = createApi();
    for (const authorization of ['Basic abc', 'Bearer', 'Bearer a b', `Bearer ${'x'.repeat(513)}`]) {
      await expectError(await api.request(PROBE, { token: null, headers: { authorization } }), 401, 'UNAUTHORIZED');
    }
  });

  it('answers 401 for an unknown token', async () => {
    await seedSession({ token: OWNER_TOKEN });

    await expectError(await createApi().request(PROBE, { token: 'some-other-token' }), 401, 'UNAUTHORIZED');
  });

  it('answers 401 for an expired session and accepts it again only before expiry', async () => {
    const clock = fakeClock();
    await seedSession({ token: OWNER_TOKEN, createdAt: START, expiresAt: START + 1_000 });
    const api = createApi({ clock });

    clock.set(START + 999);
    expect((await api.request(PROBE)).status).toBe(200);
    clock.set(START + 1_000);
    await expectError(await api.request(PROBE), 401, 'UNAUTHORIZED');
  });

  it('answers 401 for a revoked session', async () => {
    await seedSession({ token: OWNER_TOKEN, revokedAt: START + 1 });

    await expectError(await createApi().request(PROBE), 401, 'UNAUTHORIZED');
  });

  it('answers 403 for a valid session of another Telegram user', async () => {
    await seedSession({ token: OWNER_TOKEN, telegramId: '777' });

    await expectError(await createApi().request(PROBE), 403, 'FORBIDDEN');
  });

  it.each([[''], ['  ']])('denies every session when OWNER_TELEGRAM_ID is %j', async (ownerTelegramId) => {
    await seedSession({ token: OWNER_TOKEN, telegramId: '4242' });

    await expectError(await createApi({ ownerTelegramId }).request(PROBE), 403, 'FORBIDDEN');
  });

  it('answers 401 on unknown /api/v1 paths without a session and 404 with one', async () => {
    await seedSession({ token: OWNER_TOKEN });
    const api = createApi();

    await expectError(await api.request('/api/v1/nope', { token: null }), 401, 'UNAUTHORIZED');
    await expectError(await api.request('/api/v1/nope'), 404, 'NOT_FOUND');
  });

  it('never writes the token or its hash to the logs', async () => {
    await seedSession({ token: OWNER_TOKEN });
    const logSpy = vi.spyOn(console, 'log');
    const api = createApi();

    await api.request(PROBE);
    await api.request(PROBE, { token: 'unknown-token' });

    const logged = logSpy.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(logged).not.toContain(OWNER_TOKEN);
    expect(logged).not.toContain('unknown-token');
    expect(logged).not.toContain(await sha256Hex(OWNER_TOKEN));
  });
});

describe('deployment without a database', () => {
  const env = { OWNER_TELEGRAM_ID: '4242' } as AppEnv;

  it('keeps health up, answers anonymous callers 401 and a bearer holder 503', async () => {
    const app = createApp();

    const health = await app.request('/api/v1/health', {}, env);
    expect(health.status).toBe(200);
    await expectError(await app.request(PROBE, {}, env), 401, 'UNAUTHORIZED');
    await expectError(
      await app.request(PROBE, { headers: { authorization: 'Bearer whatever' } }, env),
      503,
      'UNAVAILABLE'
    );
  });
});
