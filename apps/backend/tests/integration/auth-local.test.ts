import { accessTokenSchema, meSchema } from '@alexeev/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { APP_ORIGIN } from '../helpers/auth';
import { testDb } from '../helpers/db';
import { createApi, OWNER_ID, resetDb } from '../helpers/harness';

const PATH = '/api/v1/auth/local';

async function sessionCount(): Promise<number> {
  return (await testDb().prepare('SELECT count(*) AS n FROM sessions').first<{ n: number }>())?.n ?? -1;
}

beforeEach(resetDb);

describe('POST /auth/local (npm run dev sign-in)', () => {
  it('does not exist unless the dev server enables it', async () => {
    const before = await sessionCount();
    const response = await createApi().request(PATH, { method: 'POST', token: null, headers: { origin: APP_ORIGIN } });

    expect(response.status).toBe(401);
    expect(await sessionCount()).toBe(before);
  });

  it('signs the configured owner in on localhost, with a working refresh cookie', async () => {
    const api = createApi({ localSignIn: true });
    const response = await api.request(PATH, { method: 'POST', token: null, headers: { origin: APP_ORIGIN } });

    expect(response.status).toBe(200);
    const { accessToken } = accessTokenSchema.parse(await response.json());
    const me = meSchema.parse(await (await api.request('/api/v1/auth/me', { token: accessToken })).json());
    expect(me.telegramId).toBe(OWNER_ID);

    const cookie = /^(refresh_token=[^;]+);/.exec(response.headers.get('set-cookie') ?? '')?.[1];
    expect(cookie).toBeDefined();
    const refreshed = await api.request('/api/v1/auth/refresh', {
      method: 'POST',
      token: null,
      headers: { origin: APP_ORIGIN, cookie: cookie ?? '' }
    });
    expect(refreshed.status).toBe(200);
  });

  it('refuses any host other than the local machine', async () => {
    const before = await sessionCount();
    const origin = 'https://dev.example.test';
    const response = await createApi({ localSignIn: true }).request(`${origin}${PATH}`, {
      method: 'POST',
      token: null,
      headers: { origin }
    });

    expect(response.status).toBe(404);
    expect(await sessionCount()).toBe(before);
  });

  it('refuses a foreign Origin', async () => {
    const response = await createApi({ localSignIn: true }).request(PATH, {
      method: 'POST',
      token: null,
      headers: { origin: 'https://evil.example' }
    });

    expect(response.status).toBe(403);
  });

  it('answers 503 when no owner is configured', async () => {
    const response = await createApi({ localSignIn: true, ownerTelegramId: '' }).request(PATH, {
      method: 'POST',
      token: null,
      headers: { origin: APP_ORIGIN }
    });

    expect(response.status).toBe(503);
  });
});
