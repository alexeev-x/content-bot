import { beforeEach, describe, expect, it } from 'vitest';
import { apiErrorSchema, publicationSchema, publicationSeriesSchema } from '@alexeev/contracts';
import { createD1PublicationRepository } from '../../src/modules/publishing';
import { testDb } from '../helpers/db';
import { fakeTransport, makeTick, SENT } from '../helpers/dispatch';
import {
  createApi,
  fakeClock,
  type Api,
  type FakeClock,
  OWNER_TOKEN,
  resetDb,
  seedSession,
  START
} from '../helpers/harness';
import { count, seedApprovedPost, seedDestination, seedDraftPost } from '../helpers/publishing';

// A series (owner, 22.10.2026): posts go out in order, each only after the previous one went out and no sooner than
// the gap after it; a post that did not go out holds the later ones; cancelling one cancels the later ones.

const MINUTE = 60_000;
let clock: FakeClock;
let api: Api;
let key = 0;

beforeEach(async () => {
  await resetDb();
  await seedSession({ token: OWNER_TOKEN, expiresAt: START + 400 * 24 * 60 * MINUTE });
  clock = fakeClock();
  api = createApi({ clock });
});

async function createSeries(posts: { id: string; revision: number }[], destinationId: string, intervalMinutes = 30) {
  return api.request('/api/v1/publications/series', {
    method: 'POST',
    headers: { 'idempotency-key': `series-${(key += 1)}` },
    json: {
      items: posts.map((post) => ({ postId: post.id, revision: post.revision })),
      destinationId,
      scheduledAt: new Date(START).toISOString(),
      timezone: 'Europe/Moscow',
      intervalMinutes
    }
  });
}

async function seedSeries(intervalMinutes = 30) {
  const destination = await seedDestination(api);
  const posts = [
    await seedApprovedPost(api, 'One'),
    await seedApprovedPost(api, 'Two'),
    await seedApprovedPost(api, 'Three')
  ];
  const response = await createSeries(posts, destination.id, intervalMinutes);
  expect(response.status).toBe(202);
  return publicationSeriesSchema.parse(await response.json());
}

const jobs = async () =>
  (
    await testDb()
      .prepare(
        `SELECT p.series_position AS position, j.status, j.run_at
         FROM publications p JOIN jobs j ON j.publication_id = p.id ORDER BY p.series_position`
      )
      .all<{ position: number; status: string; run_at: number }>()
  ).results;

const tickAt = async (at: number, transport = fakeTransport(SENT, SENT, SENT)) => {
  clock.set(at);
  await makeTick({ clock, transport, scheduledTime: at }).run();
  return transport;
};

describe('a publication series', () => {
  it('is written whole: one refused post writes nothing and is named', async () => {
    const destination = await seedDestination(api);
    const approved = await seedApprovedPost(api);
    const draft = await seedDraftPost(api);

    const response = await createSeries([approved, draft], destination.id);

    expect(response.status).toBe(409);
    const body = apiErrorSchema.parse(await response.json());
    expect(body.error.details).toMatchObject({ reason: 'POST_NOT_APPROVED', postId: draft.id });
    expect(await count('publications')).toBe(0);
    expect(await count('jobs')).toBe(0);
  });

  it('sends in order: the next waits for the previous, then keeps the gap after it', async () => {
    const series = await seedSeries();
    expect(series.publications.map((p) => p.series)).toEqual([
      { id: series.seriesId, position: 1, total: 3, waitingForPrevious: false },
      { id: series.seriesId, position: 2, total: 3, waitingForPrevious: true },
      { id: series.seriesId, position: 3, total: 3, waitingForPrevious: true }
    ]);

    // Long past every planned time, only the first is sent: the others wait for it.
    const first = await tickAt(START + 90 * MINUTE);
    expect(first.calls).toHaveLength(1);
    expect((await jobs()).map((job) => job.status)).toEqual(['succeeded', 'pending', 'pending']);

    // No sooner than the gap after the first went out, though its own time (START + 30 min) has passed.
    const early = await tickAt(START + 119 * MINUTE);
    expect(early.calls).toHaveLength(0);
    const second = await tickAt(START + 120 * MINUTE);
    expect(second.calls).toHaveLength(1);
    expect((await jobs()).map((job) => job.status)).toEqual(['succeeded', 'succeeded', 'pending']);
  });

  it("holds the rest while the first is unknown; the owner's «Пост вышел» releases the next", async () => {
    const series = await seedSeries();
    await tickAt(START, fakeTransport({ kind: 'unknown', reason: 'timeout' }));
    const held = await tickAt(START + 60 * MINUTE);
    expect(held.calls).toHaveLength(0);
    expect((await jobs()).map((job) => job.status)).toEqual(['unknown', 'pending', 'pending']);

    clock.set(START + 61 * MINUTE);
    const first = series.publications[0];
    const resolved = await api.request(`/api/v1/publications/${first?.id}/resolve-unknown`, {
      method: 'POST',
      json: { outcome: 'sent', revision: first?.revision, externalMessageId: '77' }
    });
    expect(resolved.status).toBe(200);
    const second = async () =>
      publicationSchema.parse(await (await api.request(`/api/v1/publications/${series.publications[1]?.id}`)).json());
    expect((await second()).series?.waitingForPrevious).toBe(true);

    // The gap counts from the owner's resolution.
    expect((await tickAt(START + 90 * MINUTE)).calls).toHaveLength(0);
    expect((await second()).series?.waitingForPrevious).toBe(true);
    expect((await tickAt(START + 91 * MINUTE)).calls).toHaveLength(1);
    expect((await jobs()).map((job) => job.status)).toEqual(['succeeded', 'succeeded', 'pending']);
  });

  it('cancelling a post cancels the later ones, never an earlier one', async () => {
    const series = await seedSeries();
    await tickAt(START);
    const second = series.publications[1];
    const cancelled = await api.request(`/api/v1/publications/${second?.id}/cancel`, {
      method: 'POST',
      json: { revision: second?.revision }
    });
    expect(cancelled.status).toBe(200);
    expect((await jobs()).map((job) => job.status)).toEqual(['succeeded', 'cancelled', 'cancelled']);
  });

  it('«Не вышел — отменить» on an unknown post cancels the later ones too', async () => {
    const series = await seedSeries();
    await tickAt(START, fakeTransport({ kind: 'unknown', reason: 'timeout' }));
    const first = series.publications[0];
    const resolved = await api.request(`/api/v1/publications/${first?.id}/resolve-unknown`, {
      method: 'POST',
      json: { outcome: 'cancel', revision: first?.revision }
    });
    expect(resolved.status).toBe(200);
    expect((await jobs()).map((job) => job.status)).toEqual(['cancelled', 'cancelled', 'cancelled']);
  });

  // QA 22.10.2026: deleting a series post failed (500) and would have left the later ones waiting for ever.
  it('deleting a post of a waiting series cancels the later posts', async () => {
    const series = await seedSeries();
    const first = series.publications[0];
    const post = await api.request(`/api/v1/posts/${first?.postId}`);
    const { revision } = (await post.json()) as { revision: number };
    const deleted = await api.request(`/api/v1/posts/${first?.postId}/delete`, { method: 'POST', json: { revision } });
    expect(deleted.status).toBe(200);
    expect((await jobs()).map((job) => job.status)).toEqual(['cancelled', 'cancelled']);
  });

  // A guard that refuses between the checks and the write writes nothing: the batch is rolled back whole.
  it('rolls the whole series back when one insert is refused at write time', async () => {
    const destination = await seedDestination(api);
    const approved = await seedApprovedPost(api, 'One');
    const draft = await seedDraftPost(api);
    const repo = createD1PublicationRepository(testDb());
    const claimed = await testDb()
      .prepare(
        `INSERT INTO idempotency_keys (scope, key, request_hash, status, created_at, expires_at)
         VALUES ('t', 'k', ?3, 'in_flight', ?1, ?2)`
      )
      .bind(START, START + 60 * MINUTE, 'a'.repeat(64))
      .run();
    expect(claimed.meta.changes).toBe(1);
    const written = await repo.createSeries({
      seriesId: '00000000-0000-4000-8000-000000000001',
      destinationId: destination.id,
      timezone: 'Europe/Moscow',
      gapMs: 30 * MINUTE,
      items: [
        {
          id: '00000000-0000-4000-8000-000000000011',
          jobId: '00000000-0000-4000-8000-000000000021',
          postId: approved.id,
          postRevision: approved.revision,
          scheduledAt: START
        },
        {
          id: '00000000-0000-4000-8000-000000000012',
          jobId: '00000000-0000-4000-8000-000000000022',
          postId: draft.id,
          postRevision: draft.revision,
          scheduledAt: START + 30 * MINUTE
        }
      ],
      now: START,
      actor: '1',
      idempotency: { scope: 't', key: 'k', requestHash: 'a'.repeat(64), claimedAt: START },
      response: { status: 202, body: '{}' }
    });
    expect(written).toBe(false);
    expect([
      await count('publications'),
      await count('jobs'),
      await count('audit_log', "action = 'publication.create'")
    ]).toEqual([0, 0, 0]);
  });
});
