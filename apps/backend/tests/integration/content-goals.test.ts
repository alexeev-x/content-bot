import { contentGoalsSchema } from '@alexeev/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { testDb } from '../helpers/db';
import { expectError } from '../helpers/expect-error';
import { createApi, fakeClock, OWNER_TOKEN, resetDb, seedSession, START } from '../helpers/harness';

const DAY = 24 * 60 * 60_000;

function day(offsetDays: number): string {
  return new Date(START + offsetDays * DAY).toISOString().slice(0, 10);
}

async function followers(platform: string, offsetDays: number, count: number): Promise<void> {
  await testDb()
    .prepare('INSERT INTO content_audience_days (platform, day, followers, observed_at) VALUES (?, ?, ?, ?)')
    .bind(platform, day(offsetDays), count, START)
    .run();
}

beforeEach(async () => {
  await resetDb();
  await seedSession({ token: OWNER_TOKEN });
});

describe('content goals', () => {
  it('sets, replaces and removes a goal, with the pace and forecast from the stored follower counts', async () => {
    const api = createApi({ clock: fakeClock() });
    // +70 in 14 days: 35 a week; 900 → 1 000 takes 20 more days.
    await followers('telegram', -14, 830);
    await followers('telegram', 0, 900);

    const empty = await api.request('/api/v1/content-analytics/goals');
    expect(contentGoalsSchema.parse(await empty.json())).toEqual({ goals: [] });

    const set = await api.request('/api/v1/content-analytics/goals/telegram', {
      method: 'PUT',
      json: { target: 1000 }
    });
    expect(set.status).toBe(200);
    expect(contentGoalsSchema.parse(await set.json()).goals).toEqual([
      {
        platform: 'telegram',
        target: 1000,
        followers: 900,
        perWeek: 35,
        forecastDay: day(20),
        reached: false,
        setAt: new Date(START).toISOString()
      }
    ]);

    const reached = await api.request('/api/v1/content-analytics/goals/telegram', {
      method: 'PUT',
      json: { target: 850 }
    });
    expect(contentGoalsSchema.parse(await reached.json()).goals[0]).toMatchObject({
      target: 850,
      reached: true,
      forecastDay: null
    });

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const removed = await api.request('/api/v1/content-analytics/goals/telegram', { method: 'DELETE' });
      expect(contentGoalsSchema.parse(await removed.json())).toEqual({ goals: [] });
    }
  });

  it('rejects a bad target or platform and an unauthenticated caller', async () => {
    const api = createApi({ clock: fakeClock() });
    await expectError(
      await api.request('/api/v1/content-analytics/goals/telegram', { method: 'PUT', json: { target: 0 } }),
      400,
      'VALIDATION_ERROR'
    );
    await expectError(
      await api.request('/api/v1/content-analytics/goals/instagram', { method: 'PUT', json: { target: 10 } }),
      400,
      'VALIDATION_ERROR'
    );
    await expectError(
      await api.request('/api/v1/content-analytics/goals/telegram', { method: 'PUT', json: { target: 5, extra: 1 } }),
      400,
      'VALIDATION_ERROR'
    );
    await expectError(await api.request('/api/v1/content-analytics/goals', { token: null }), 401, 'UNAUTHORIZED');
  });
});
