import { rubricForecastSchema, rubricSchedulerStatusSchema } from '@alexeev/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { type Api, createApi, fakeClock, OWNER_TOKEN, resetDb, seedSession, START } from '../helpers/harness';

// «Рубрики» stage 3: the read-only status and the 35-day forecast parse with their contracts, owner only.

let api: Api;

beforeEach(async () => {
  await resetDb();
  await seedSession({ token: OWNER_TOKEN, expiresAt: START + 400 * 24 * 60 * 60_000 });
  api = createApi({
    clock: fakeClock(),
    env: { FORECAST_CAPABILITIES: 'browser,ai_text,ai_image,ai_upscale,stratz,stats_db' }
  });
});

describe('GET /api/v1/rubrics', () => {
  it('says the scheduler only forecasts for now, with what this Worker can run', async () => {
    const response = await api.request('/api/v1/rubrics/status');
    expect(response.status).toBe(200);
    const body = rubricSchedulerStatusSchema.parse(await response.json());
    expect(body).toMatchObject({ mode: 'forecast_only', enabled: false, effective: 'unavailable' });
    expect(body.capabilities).toEqual({ browser: true, openai: true, stratz: true, statsDb: true });
  });

  it('forecasts 35 Moscow days that keep the daily caps', async () => {
    const response = await api.request('/api/v1/rubrics/forecast');
    expect(response.status).toBe(200);
    const body = rubricForecastSchema.parse(await response.json());
    expect(body.days).toHaveLength(35);
    expect(body.days.every((day) => day.slots.length <= 3)).toBe(true);
    expect(body.days.flatMap((day) => day.slots).length).toBeGreaterThan(20);
    expect(body.unavailable).toEqual([]);
  });

  it('answers 401 without the owner session', async () => {
    expect((await api.request('/api/v1/rubrics/forecast', { token: null })).status).toBe(401);
  });
});
