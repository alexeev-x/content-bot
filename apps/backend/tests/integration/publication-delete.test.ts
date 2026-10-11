import { bulkDeletePublicationsResultSchema, deletePublicationResultSchema } from '@alexeev/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { testDb } from '../helpers/db';
import { expectError } from '../helpers/expect-error';
import { type Api, createApi, fakeClock, OWNER_ID, OWNER_TOKEN, resetDb, seedSession, START } from '../helpers/harness';
import { count, jobOf, seedApprovedPost, seedDestination } from '../helpers/publishing';

let api: Api;
let postId: string;
let revision: number;
let destinationId: string;

beforeEach(async () => {
  await resetDb();
  await seedSession({ token: OWNER_TOKEN, expiresAt: START + 86_400_000 });
  api = createApi({ clock: fakeClock() });
  const post = await seedApprovedPost(api);
  postId = post.id;
  revision = post.revision;
  destinationId = (await seedDestination(api)).id;
});

async function schedule(status: 'succeeded' | 'failed' | 'cancelled' | 'pending' | 'claimed' | 'unknown') {
  const response = await api.request('/api/v1/publications', {
    method: 'POST',
    headers: { 'idempotency-key': crypto.randomUUID() },
    json: {
      postId,
      revision,
      destinationId,
      scheduledAt: new Date(START + 60_000).toISOString(),
      timezone: 'Europe/Chisinau'
    }
  });
  expect(response.status).toBe(202);
  const publication = (await response.json()) as { id: string; revision: number };
  const job = await jobOf(publication.id);
  await testDb()
    .prepare('UPDATE jobs SET status = ?2, attempts = 1, send_started_at = ?3 WHERE id = ?1')
    .bind(job.id, status, status === 'succeeded' || status === 'unknown' ? START : null)
    .run();
  if (status === 'failed' || status === 'unknown') {
    await testDb()
      .prepare(
        `INSERT INTO incidents (id, kind, publication_id, job_id, code, created_at, resolved_at, details)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL, '{}')`
      )
      .bind(
        crypto.randomUUID(),
        status === 'unknown' ? 'publish_unknown' : 'publish_failed',
        publication.id,
        job.id,
        'TEST',
        START
      )
      .run();
  }
  await testDb()
    .prepare(
      `INSERT INTO job_attempts (job_id, attempt, started_at, finished_at, outcome, error_code, retry_after, external_message_id)
       VALUES (?1, 1, ?2, ?2, ?3, NULL, NULL, ?4)`
    )
    .bind(job.id, START, status === 'succeeded' ? 'sent' : status === 'failed' ? 'rejected' : 'skipped', null)
    .run();
  return publication;
}

const deleteOne = (id: string, expectedRevision: number) =>
  api.request(`/api/v1/publications/${id}/delete`, { method: 'POST', json: { revision: expectedRevision } });
const deleteMany = (items: { id: string; revision: number }[]) =>
  api.request('/api/v1/publications/delete', { method: 'POST', json: { items } });

describe('final publication deletion', () => {
  it('removes a sent publication, preserving the post, Telegram message metadata, job attempts and audit history', async () => {
    const publication = await schedule('succeeded');
    await testDb()
      .prepare('UPDATE publications SET external_message_id = ?2 WHERE id = ?1')
      .bind(publication.id, '42')
      .run();

    const response = await deleteOne(publication.id, publication.revision);

    expect(response.status).toBe(200);
    expect(deletePublicationResultSchema.parse(await response.json())).toEqual({
      id: publication.id,
      outcome: 'deleted'
    });
    expect(await count('publications', `id = '${publication.id}'`)).toBe(0);
    expect(await count('posts', `id = '${postId}'`)).toBe(1);
    expect(await count('jobs', `dedupe_key = 'publish:${publication.id}' AND publication_id IS NULL`)).toBe(1);
    expect(await count('job_attempts')).toBe(1);
    const audit = await testDb()
      .prepare(
        "SELECT actor_telegram_id, action, entity_id, details FROM audit_log WHERE action = 'publication.delete'"
      )
      .all();
    expect(audit.results).toHaveLength(1);
    expect(audit.results[0]).toMatchObject({
      actor_telegram_id: OWNER_ID,
      entity_id: publication.id,
      details: '{"revision":0,"status":"succeeded"}'
    });
  });

  it('deletes failed and cancelled rows in one request while retaining a failed incident without its publication link', async () => {
    const failed = await schedule('failed');
    const failedJob = await jobOf(failed.id);
    const cancelled = await schedule('cancelled');

    const response = await deleteMany([
      { id: failed.id, revision: failed.revision },
      { id: cancelled.id, revision: cancelled.revision }
    ]);

    expect(bulkDeletePublicationsResultSchema.parse(await response.json())).toEqual({
      items: [
        { id: failed.id, outcome: 'deleted' },
        { id: cancelled.id, outcome: 'deleted' }
      ]
    });
    expect(await count('publications')).toBe(0);
    expect(await count('incidents', `job_id = '${failedJob.id}' AND publication_id IS NULL`)).toBe(1);
    expect(await count('job_attempts')).toBe(2);
    expect(await count('audit_log', "action = 'publication.delete'")).toBe(2);
  });

  it('refuses stale, non-final, in-progress, unknown and missing publications without removing them', async () => {
    const stale = await schedule('pending');
    const pending = await schedule('pending');
    const inProgress = await schedule('claimed');
    const unknown = await schedule('unknown');
    const missing = crypto.randomUUID();

    const response = await deleteMany([
      { id: stale.id, revision: stale.revision + 1 },
      { id: pending.id, revision: pending.revision },
      { id: inProgress.id, revision: inProgress.revision },
      { id: unknown.id, revision: unknown.revision },
      { id: missing, revision: 0 }
    ]);

    expect(bulkDeletePublicationsResultSchema.parse(await response.json()).items).toEqual([
      { id: stale.id, outcome: 'refused', reason: 'STALE_REVISION' },
      { id: pending.id, outcome: 'refused', reason: 'NOT_FINAL' },
      { id: inProgress.id, outcome: 'refused', reason: 'PUBLICATION_IN_PROGRESS' },
      { id: unknown.id, outcome: 'refused', reason: 'PUBLICATION_UNKNOWN' },
      { id: missing, outcome: 'refused', reason: 'NOT_FOUND' }
    ]);
    expect(await count('publications')).toBe(4);
    expect(await count('audit_log', "action = 'publication.delete'")).toBe(0);
  });

  it('requires unique ids and keeps a single delete safe against unknown results', async () => {
    const unknown = await schedule('unknown');
    await expectError(await deleteOne(unknown.id, unknown.revision), 409, 'CONFLICT', {
      reason: 'PUBLICATION_UNKNOWN',
      publicationId: unknown.id
    });
    const duplicate = await deleteMany([
      { id: unknown.id, revision: unknown.revision },
      { id: unknown.id, revision: unknown.revision }
    ]);
    await expectError(duplicate, 400, 'VALIDATION_ERROR', { reason: 'DUPLICATE_IDS' });
    expect(await count('publications')).toBe(1);
  });
});
