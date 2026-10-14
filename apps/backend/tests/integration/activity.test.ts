import { activityPageSchema } from '@alexeev/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { expectError } from '../helpers/expect-error';
import { type Api, createApi, fakeClock, OWNER_TOKEN, resetDb, seedSession, START } from '../helpers/harness';
import { seedApprovedPost, seedDestination } from '../helpers/publishing';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const iso = (ms: number) => new Date(ms).toISOString();

let api: Api;

beforeEach(async () => {
  await resetDb();
  await seedSession({ token: OWNER_TOKEN, expiresAt: START + 400 * DAY });
  api = createApi({ clock: fakeClock() });
});

async function feed(query = '') {
  const response = await api.request(`/api/v1/activity${query}`);
  expect(response.status).toBe(200);
  return activityPageSchema.parse(await response.json());
}

describe('GET /api/v1/activity', () => {
  it('lists what the owner did, newest first, with titles, links and the plan', async () => {
    const post = await seedApprovedPost(api, 'Patch 7.41');
    const destination = await seedDestination(api, { title: 'Dota channel' });
    api.clock.advance(MINUTE);
    const created = await api.request('/api/v1/publications', {
      method: 'POST',
      headers: { 'idempotency-key': 'activity-1' },
      json: {
        postId: post.id,
        revision: post.revision,
        destinationId: destination.id,
        scheduledAt: iso(START + DAY),
        timezone: 'UTC'
      }
    });
    expect(created.status).toBe(202);
    const publication = (await created.json()) as { id: string };

    const { items } = await feed();
    expect(items[0]).toMatchObject({
      action: 'publication.create',
      category: 'publications',
      actor: 'owner',
      title: 'Patch 7.41',
      postId: post.id,
      publicationId: publication.id,
      channelTitle: 'Dota channel',
      scheduledAt: iso(START + DAY)
    });
    expect(items.map((item) => item.action)).toContain('post.create');
    expect(items.map((item) => item.action)).toContain('post.approve');
    expect(items.map((item) => item.action)).toContain('destination.create');
  });

  it('filters by category and pages with a cursor', async () => {
    await seedApprovedPost(api, 'First');
    api.clock.advance(MINUTE);
    await seedApprovedPost(api, 'Second');

    const posts = await feed('?category=posts&limit=2');
    expect(posts.items).toHaveLength(2);
    expect(posts.items.every((item) => item.category === 'posts')).toBe(true);
    expect(posts.nextCursor).not.toBeNull();
    const next = await feed(`?category=posts&limit=2&cursor=${posts.nextCursor}`);
    expect(next.items.map((item) => item.id)).not.toContain(posts.items[0]?.id);
    expect((await feed('?category=errors')).items).toEqual([]);
  });

  it('rejects a forged cursor', async () => {
    await expectError(await api.request('/api/v1/activity?cursor=bm90LWEtY3Vyc29y'), 400, 'VALIDATION_ERROR');
  });
});
