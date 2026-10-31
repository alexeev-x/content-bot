import {
  rubricCalendarSchema,
  rubricForecastSchema,
  rubricItemSchema,
  rubricListSchema,
  rubricSchedulerStatusSchema
} from '@alexeev/contracts';
import { seedDestination } from '../helpers/publishing';
import { beforeEach, describe, expect, it } from 'vitest';
import { testDb } from '../helpers/db';
import { type Api, createApi, fakeClock, OWNER_TOKEN, resetDb, seedSession, START } from '../helpers/harness';

// «Рубрики» stage 3: the read-only status and the 35-day forecast parse with their contracts, owner only.

let api: Api;

beforeEach(async () => {
  await resetDb();
  await testDb().batch([
    testDb().prepare('DELETE FROM rubric_slots'),
    testDb().prepare('DELETE FROM rubric_settings'),
    testDb().prepare(
      'UPDATE rubric_scheduler_settings SET enabled = 0, destination_id = NULL, revision = 0 WHERE id = 1'
    )
  ]);
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

describe('owner actions in «Рубрики»', () => {
  const live = () => createApi({ clock: fakeClock(), env: { RUBRIC_SCHEDULER: 'on' } });

  it('refuses switching on without a channel, and switches on with one', async () => {
    const owner = live();
    const status = rubricSchedulerStatusSchema.parse(await (await owner.request('/api/v1/rubrics/status')).json());
    expect(status.mode).toBe('live');
    const refused = await owner.request('/api/v1/rubrics/scheduler', {
      method: 'PUT',
      json: { enabled: true, revision: status.revision }
    });
    expect(refused.status).toBe(400);
    expect(((await refused.json()) as { error: { details: { reason: string } } }).error.details.reason).toBe(
      'DESTINATION_REQUIRED'
    );
    const channel = await seedDestination(owner, { chatId: '-100777' });
    const switched = await owner.request('/api/v1/rubrics/scheduler', {
      method: 'PUT',
      json: { enabled: true, destinationId: channel.id, revision: status.revision }
    });
    expect(switched.status).toBe(200);
    expect(rubricSchedulerStatusSchema.parse(await switched.json())).toMatchObject({ enabled: true });
    const stale = await owner.request('/api/v1/rubrics/scheduler', {
      method: 'PUT',
      json: { enabled: false, revision: status.revision }
    });
    expect(stale.status).toBe(409);
  });

  it("lists every rubric and takes the owner's rest", async () => {
    const owner = live();
    const list = rubricListSchema.parse(await (await owner.request('/api/v1/rubrics')).json());
    expect(list.items).toHaveLength(30);
    const quote = list.items.find((item) => item.key === 'quote_of_day');
    expect(quote?.state).toBe('active');
    const changed = await owner.request('/api/v1/rubrics/quote_of_day', {
      method: 'PATCH',
      json: { restDays: 10, revision: quote?.revision ?? 0 }
    });
    expect(changed.status).toBe(200);
    expect(rubricItemSchema.parse(await changed.json()).rest).toMatchObject({ days: 10, source: 'manual' });
    expect(
      (await owner.request('/api/v1/rubrics/quote_of_day', { method: 'PATCH', json: { restDays: 3, revision: 1 } }))
        .status
    ).toBe(400);
  });

  it('caps the calendar span and answers 404 for an unknown slot', async () => {
    const owner = live();
    expect((await owner.request('/api/v1/rubrics/calendar?from=2027-01-01&to=2027-03-01')).status).toBe(400);
    const calendar = await owner.request('/api/v1/rubrics/calendar?from=2027-01-15&to=2027-01-20');
    expect(rubricCalendarSchema.parse(await calendar.json()).slots).toEqual([]);
    expect((await owner.request('/api/v1/rubrics/slots/00000000-0000-4000-8000-000000000000')).status).toBe(404);
  });
});
