import {
  autopublishActivitySchema,
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
    expect(list.items).toHaveLength(31);
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

describe('start blockers', () => {
  const dev = () => createApi({ clock: fakeClock(), env: { RUBRIC_SCHEDULER: 'rehearsal' } });
  const status = async (owner: Api) =>
    rubricSchedulerStatusSchema.parse(await (await owner.request('/api/v1/rubrics/status')).json());

  it('names the master switch and the «Рубрики» job apart, each with its fix', async () => {
    const { locks } = await status(dev());
    expect(locks).toEqual(
      expect.arrayContaining([
        { code: 'SWITCHED_OFF', fix: 'ENABLE_RUBRICS' },
        { code: 'NO_DESTINATION', fix: 'PICK_CHANNEL' },
        { code: 'LAB_MASTER_OFF', fix: 'ENABLE_LAB_MASTER' },
        { code: 'LAB_OFF', fix: 'ENABLE_LAB_JOB' }
      ])
    );
  });

  it('offers the first slot from the forecast before anything is planned', async () => {
    expect((await status(dev())).firstSlot).not.toBeNull();
  });

  it('switches the DEV pair on once, and replaying it changes nothing', async () => {
    const owner = dev();
    for (let round = 0; round < 2; round += 1) {
      const response = await owner.request('/api/v1/rubrics/dev-enable', { method: 'POST' });
      expect(response.status).toBe(200);
      const codes = rubricSchedulerStatusSchema.parse(await response.json()).locks.map((lock) => lock.code);
      expect(codes).not.toContain('LAB_MASTER_OFF');
      expect(codes).not.toContain('LAB_OFF');
    }
    const settings = (await (await owner.request('/api/v1/settings/operations')).json()) as {
      revision: number;
      background: { enabled: boolean; jobs: { rubricScheduler: boolean } };
    };
    expect(settings.background).toMatchObject({ enabled: true, jobs: { rubricScheduler: true } });
    expect(settings.revision).toBe(1);
  });

  it('is a 404 outside DEV and a 401 without the owner session', async () => {
    const production = createApi({ clock: fakeClock(), env: { RUBRIC_SCHEDULER: 'on' } });
    const refused = await production.request('/api/v1/rubrics/dev-enable', { method: 'POST' });
    expect(refused.status).toBe(404);
    expect(((await refused.json()) as { error: { details: { reason: string } } }).error.details.reason).toBe(
      'NOT_HERE'
    );
    expect((await dev().request('/api/v1/rubrics/dev-enable', { method: 'POST', token: null })).status).toBe(401);
  });

  it('lists what keeps the news from going out, and the DEV job only on DEV', async () => {
    const blockers = async (owner: Api) =>
      autopublishActivitySchema.parse(await (await owner.request('/api/v1/settings/autopublish/activity')).json())
        .blockers;
    expect(await blockers(dev())).toEqual([
      { code: 'NEWS_OFF', fix: 'ENABLE_NEWS' },
      { code: 'NEWS_NO_DESTINATION', fix: 'PICK_CHANNEL' },
      { code: 'NEWS_SOURCES_JOB_OFF', fix: 'ENABLE_LAB_MASTER' }
    ]);
    const production = createApi({ clock: fakeClock(), env: { RUBRIC_SCHEDULER: 'on' } });
    expect((await blockers(production)).map((blocker) => blocker.code)).toEqual(['NEWS_OFF', 'NEWS_NO_DESTINATION']);
  });
});
