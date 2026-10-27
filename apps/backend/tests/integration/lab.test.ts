import { apiErrorSchema, sendRubricSampleResponseSchema } from '@alexeev/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApi, fakeClock, OWNER_TOKEN, resetDb, seedSession, START } from '../helpers/harness';

const send = (api: ReturnType<typeof createApi>, json: unknown) =>
  api.request('/api/v1/lab/rubrics', { method: 'POST', json });

beforeEach(async () => {
  await resetDb();
  await seedSession({ token: OWNER_TOKEN, expiresAt: START + 24 * 60 * 60 * 1000 });
});

// The samples call live sources, the AI, the browser and Telegram from a queued job; these cases stop at the queue.
describe('POST /api/v1/lab/rubrics', () => {
  it('does not exist without the lab (a production build)', async () => {
    const response = await send(createApi({ clock: fakeClock() }), { rubric: 'tier_list' });
    expect(response.status).toBe(404);
  });

  it('rejects an unknown rubric and answers 503 without the bot', async () => {
    const dev = createApi({ clock: fakeClock(), botToken: null, lab: true });
    expect((await send(dev, { rubric: 'nope' })).status).toBe(400);
    const response = await send(dev, { rubric: 'tier_list' });
    expect(response.status).toBe(503);
    expect(apiErrorSchema.parse(await response.json())).toMatchObject({
      error: { code: 'UNAVAILABLE', details: { reason: 'BOT_NOT_CONFIGURED' } }
    });
  });

  it('queues the pressed rubric alone and answers 202', async () => {
    const dev = createApi({ clock: fakeClock(), lab: true });
    const response = await send(dev, { rubric: 'tier_list' });
    expect(response.status).toBe(202);
    expect(sendRubricSampleResponseSchema.parse(await response.json())).toEqual({ rubric: 'tier_list', queued: true });
    expect(dev.aiJobs.sent).toEqual([expect.objectContaining({ kind: 'rubric_sample', rubric: 'tier_list' })]);
  });
});
