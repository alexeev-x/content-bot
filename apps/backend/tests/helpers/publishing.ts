import {
  type DestinationDto,
  destinationSchema,
  type PostDto,
  postSchema,
  type PublicationDto,
  publicationSchema
} from '@alexeev/contracts';
import { expect } from 'vitest';
import { testDb } from './db';
import type { Api } from './harness';

let counter = 0;
const nextKey = () => `seed-${++counter}`;

export async function seedApprovedPost(api: Api, title = 'Patch 7.40'): Promise<PostDto> {
  const created = await api.request('/api/v1/posts', {
    method: 'POST',
    headers: { 'idempotency-key': nextKey() },
    json: { title, body: 'Body text' }
  });
  expect(created.status).toBe(201);
  const draft = postSchema.parse(await created.json());
  const approved = await api.request(`/api/v1/posts/${draft.id}/approve`, {
    method: 'POST',
    json: { revision: draft.revision }
  });
  expect(approved.status).toBe(200);
  return postSchema.parse(await approved.json());
}

export async function seedDraftPost(api: Api): Promise<PostDto> {
  const created = await api.request('/api/v1/posts', {
    method: 'POST',
    headers: { 'idempotency-key': nextKey() },
    json: { title: 'Draft', body: 'Body text' }
  });
  expect(created.status).toBe(201);
  return postSchema.parse(await created.json());
}

export async function seedDestination(
  api: Api,
  input: { title?: string; chatId?: string; kind?: 'channel' | 'group' } = {}
): Promise<DestinationDto> {
  const response = await api.request('/api/v1/destinations', {
    method: 'POST',
    headers: { 'idempotency-key': nextKey() },
    json: {
      title: input.title ?? 'Main channel',
      chatId: input.chatId ?? `-100${Math.floor(Math.random() * 1e9)}`,
      kind: input.kind ?? 'channel'
    }
  });
  expect(response.status).toBe(201);
  return destinationSchema.parse(await response.json());
}

/**
 * A publication as a fixture. A post goes to a channel once at a time (ALREADY_PUBLISHED); tests that need
 * several of one post in one channel get them: the live ones read as sent while this one is written, then are
 * put back. The rule itself is tested in publications.test.ts.
 */
export async function seedPublication(
  api: Api,
  input: { postId: string; revision: number; destinationId: string; scheduledAt: string; timezone?: string }
): Promise<PublicationDto> {
  const live = await testDb()
    .prepare(
      `SELECT j.id, j.status FROM jobs j JOIN publications p ON p.id = j.publication_id
       WHERE p.post_id = ? AND p.destination_id = ? AND j.status IN ('pending', 'claimed', 'retry_wait', 'unknown')`
    )
    .bind(input.postId, input.destinationId)
    .all<{ id: string; status: string }>();
  const park = async (status: (row: { status: string }) => string) => {
    if (live.results.length > 0)
      await testDb().batch(
        live.results.map((row) => testDb().prepare('UPDATE jobs SET status = ? WHERE id = ?').bind(status(row), row.id))
      );
  };
  await park(() => 'succeeded');
  const response = await api.request('/api/v1/publications', {
    method: 'POST',
    headers: { 'idempotency-key': nextKey() },
    json: { timezone: 'Europe/Moscow', ...input }
  });
  await park((row) => row.status);
  expect(response.status).toBe(202);
  return publicationSchema.parse(await response.json());
}

export interface JobRow {
  id: string;
  status: string;
  run_at: number;
  lease_until: number | null;
  send_started_at: number | null;
  attempts: number;
  dedupe_key: string;
}

export async function jobOf(publicationId: string): Promise<JobRow> {
  const row = await testDb()
    .prepare(
      'SELECT id, status, run_at, lease_until, send_started_at, attempts, dedupe_key FROM jobs WHERE publication_id = ?1'
    )
    .bind(publicationId)
    .first<JobRow>();
  if (row === null) throw new Error(`No job for publication ${publicationId}`);
  return row;
}

// The dispatcher's conditional claim, copied from docs/BACKEND_ARCHITECTURE.md §5.
// Returns the number of rows it claimed (1 = this caller won).
export async function claimJob(jobId: string, now: number, leaseUntil: number): Promise<number> {
  const result = await testDb()
    .prepare(
      `UPDATE jobs
       SET status = 'claimed', attempts = attempts + 1,
           lease_until = ?1, updated_at = ?2
       WHERE id = ?3 AND status IN ('pending', 'retry_wait')
         AND run_at <= ?2
         AND (lease_until IS NULL OR lease_until < ?2)
         AND (blocked_by_job_id IS NULL OR EXISTS (
           SELECT 1 FROM jobs previous WHERE previous.id = jobs.blocked_by_job_id AND previous.status = 'succeeded'
             AND previous.updated_at + coalesce(jobs.chain_gap_ms, 0) <= ?2))
       RETURNING id, publication_id, attempts`
    )
    .bind(leaseUntil, now, jobId)
    .all();
  return result.results.length;
}

export async function count(table: string, where = '1 = 1'): Promise<number> {
  const row = await testDb().prepare(`SELECT count(*) AS n FROM ${table} WHERE ${where}`).first<{ n: number }>();
  return row?.n ?? -1;
}
