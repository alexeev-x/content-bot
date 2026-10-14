import { type PostDto, postSchema } from '@alexeev/contracts';
import { expect } from 'vitest';
import { testDb } from './db';
import { fakeTransport, isoAt, makeTick, SENT, seedDueJob } from './dispatch';
import type { Api, FakeClock } from './harness';
import { seedDestination, seedPublication } from './publishing';

export const DAY = 24 * 60 * 60_000;
// START is minute 0 of an hour; these ticks run the purge and the plain minute.
export const PURGE_TICK_OFFSET = 30 * 60_000;

export async function getPost(api: Api, id: string): Promise<PostDto> {
  const response = await api.request(`/api/v1/posts/${id}`);
  expect(response.status).toBe(200);
  return postSchema.parse(await response.json());
}

export async function postRow(id: string): Promise<{
  status: string;
  revision: number;
  archived_at: number | null;
  restored_at: number | null;
  updated_at: number;
} | null> {
  return testDb()
    .prepare('SELECT status, revision, archived_at, restored_at, updated_at FROM posts WHERE id = ?1')
    .bind(id)
    .first();
}

/** One Cron tick (reconcile, dispatch, archive) at the clock's current time. */
export async function runTick(
  clock: FakeClock,
  options: { transport?: ReturnType<typeof fakeTransport>; scheduledTime?: number } = {}
): Promise<ReturnType<typeof fakeTransport>> {
  const transport = options.transport ?? fakeTransport(SENT);
  await makeTick({ clock, transport, scheduledTime: options.scheduledTime }).run();
  return transport;
}

/** A post whose single publication is due now and has been sent by a tick (and, in that tick, archived). */
export async function seedSentPost(api: Api, clock: FakeClock, title?: string) {
  const seeded = await seedDueJob(api, { title });
  await runTick(clock);
  return seeded;
}

/** An approved post with one more publication in the future (a live `scheduled` one). */
export async function addScheduled(api: Api, postId: string, revision: number, at: number) {
  const destination = await seedDestination(api);
  return seedPublication(api, { postId, revision, destinationId: destination.id, scheduledAt: isoAt(at) });
}

export async function setJob(publicationId: string, set: string, ...bindings: (string | number | null)[]) {
  await testDb()
    .prepare(`UPDATE jobs SET ${set} WHERE publication_id = ?1`)
    .bind(publicationId, ...bindings)
    .run();
}

export async function tableCounts(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const table of ['posts', 'post_revisions', 'publications', 'jobs', 'job_attempts', 'incidents']) {
    const row = await testDb().prepare(`SELECT count(*) AS n FROM ${table}`).first<{ n: number }>();
    counts[table] = row?.n ?? -1;
  }
  return counts;
}
