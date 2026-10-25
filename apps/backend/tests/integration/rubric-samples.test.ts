import { apiErrorSchema } from '@alexeev/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApi, fakeClock, OWNER_TOKEN, resetDb, seedSession, START } from '../helpers/harness';

const send = (api: ReturnType<typeof createApi>, json: unknown) =>
  api.request('/api/v1/rubric-samples', { method: 'POST', json });

beforeEach(async () => {
  await resetDb();
  await seedSession({ token: OWNER_TOKEN, expiresAt: START + 24 * 60 * 60 * 1000 });
});

// The samples call OpenDota, the browser and Telegram, so these cases stop before any of them.
describe('POST /api/v1/rubric-samples', () => {
  it('is refused where RUBRIC_SAMPLES is not "true" (production)', async () => {
    const response = await send(createApi({ clock: fakeClock() }), { rubric: 'rank_meta' });
    expect(response.status).toBe(403);
    expect(apiErrorSchema.parse(await response.json())).toMatchObject({
      error: { code: 'FORBIDDEN', details: { reason: 'RUBRIC_SAMPLES_OFF' } }
    });
  });

  it('rejects an unknown rubric and answers 503 without the bot', async () => {
    const dev = createApi({ clock: fakeClock(), botToken: null, env: { RUBRIC_SAMPLES: 'true' } });
    expect((await send(dev, { rubric: 'nope' })).status).toBe(400);
    const response = await send(dev, { rubric: 'rank_meta' });
    expect(response.status).toBe(503);
    expect(apiErrorSchema.parse(await response.json())).toMatchObject({
      error: { code: 'UNAVAILABLE', details: { reason: 'BOT_NOT_CONFIGURED' } }
    });
  });
});
