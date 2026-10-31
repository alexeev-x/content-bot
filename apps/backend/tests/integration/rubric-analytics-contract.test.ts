import { rubricCommentsSchema, rubricCompareSchema, rubricPostsSchema } from '@alexeev/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { type Api, createApi, fakeClock, OWNER_TOKEN, resetDb, seedSession, START } from '../helpers/harness';

// «Рубрики» → «Аналитика» (stage 7): the three reads parse with their contracts, refuse bad input, owner only.

let api: Api;

beforeEach(async () => {
  await resetDb();
  await seedSession({ token: OWNER_TOKEN, expiresAt: START + 400 * 24 * 60 * 60_000 });
  api = createApi({ clock: fakeClock(), env: { ANALYTICS_TELEGRAM_CHANNEL: 'alexeev_x' } });
});

describe('GET /api/v1/rubric-analytics', () => {
  it('answers the comparison, a rubric and the comments with empty data', async () => {
    const compare = await api.request('/api/v1/rubric-analytics/compare?days=30');
    expect(compare.status).toBe(200);
    expect(rubricCompareSchema.parse(await compare.json())).toMatchObject({ days: 30, rows: [] });
    const posts = await api.request('/api/v1/rubric-analytics/posts?rubric=whose_ability&days=all');
    expect(posts.status).toBe(200);
    expect(rubricPostsSchema.parse(await posts.json())).toMatchObject({ usual: null, posts: [] });
    const comments = await api.request('/api/v1/rubric-analytics/comments?days=7');
    expect(comments.status).toBe(200);
    expect(rubricCommentsSchema.parse(await comments.json())).toMatchObject({
      state: 'not_connected',
      textKeptDays: 10
    });
  });

  it('refuses a bad period and an unknown rubric', async () => {
    expect((await api.request('/api/v1/rubric-analytics/compare?days=8')).status).toBe(400);
    expect((await api.request('/api/v1/rubric-analytics/posts?rubric=nope')).status).toBe(400);
  });

  it('is for the owner only', async () => {
    expect((await api.request('/api/v1/rubric-analytics/compare', { token: null })).status).toBe(401);
  });
});
