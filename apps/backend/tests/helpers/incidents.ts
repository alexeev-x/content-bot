import { testDb } from './db';

// An incident row written directly, for the shapes a test needs without driving a whole send. `details`
// holds a marker so a test can prove it never reaches a response.
export async function insertIncident(input: {
  id?: string;
  kind?: 'publish_failed' | 'publish_unknown';
  code?: string;
  createdAt: number;
  resolvedAt?: number | null;
  publicationId?: string;
  jobId?: string;
}): Promise<string> {
  const id = input.id ?? crypto.randomUUID();
  await testDb()
    .prepare(
      `INSERT INTO incidents (id, kind, publication_id, job_id, code, created_at, resolved_at, details, owner_notified_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, '{"reason":"secret-detail"}', ?6)`
    )
    .bind(
      id,
      input.kind ?? 'publish_failed',
      input.publicationId ?? null,
      input.jobId ?? null,
      input.code ?? 'DESTINATION_UNAVAILABLE',
      input.createdAt,
      input.resolvedAt ?? null
    )
    .run();
  return id;
}
