import type { PublicationStatus } from '@alexeev/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { testDb } from '../../../../tests/helpers/db';
import { resetDb, START } from '../../../../tests/helpers/harness';
import { JOB_STATES_FOR_TESTS } from '../../../../tests/helpers/job-states';
import { claimJob, count } from '../../../../tests/helpers/publishing';
import { sha256Hex } from '../../../platform/security/sha256';
import type { NewPublication } from '../application/ports';
import { projectPublicationStatus } from '../domain/status-projection';
import { createD1PublicationRepository, listPublicationsSql, SUMMARY_SQL } from './d1-publication-repository';

beforeEach(resetDb);

const NOW = START;
const POST = '5d4f8a7e-3b6c-4e2a-9f10-1a2b3c4d5e6f';
const DESTINATION = '7e6d5c4b-3a29-4180-8f7e-6d5c4b3a2918';
const CURSOR_ID = '0b1f6c52-8d3e-4a47-9a35-2f6f0c1d7e90';

async function seedPost(options: { status?: 'draft' | 'approved'; revision?: number } = {}): Promise<void> {
  const status = options.status ?? 'approved';
  const revision = options.revision ?? 1;
  const db = testDb();
  await db.batch([
    db
      .prepare(
        `INSERT INTO posts (id, title, body, status, revision, created_at, updated_at) VALUES (?1, 'T', 'B', ?2, ?3, ?4, ?4)`
      )
      .bind(POST, status, revision, NOW),
    ...Array.from({ length: revision + 1 }, (_, rev) =>
      db
        .prepare(
          `INSERT INTO post_revisions (post_id, revision, title, body, status, created_at) VALUES (?1, ?2, 'T', 'B', ?3, ?4)`
        )
        .bind(POST, rev, rev === revision ? status : 'draft', NOW)
    )
  ]);
}

async function seedDestination(enabled = 1): Promise<void> {
  await testDb()
    .prepare(
      `INSERT INTO destinations (id, title, chat_id, kind, enabled, revision, created_at, updated_at)
       VALUES (?1, 'D', '-1001', 'channel', ?2, 0, ?3, ?3)`
    )
    .bind(DESTINATION, enabled, NOW)
    .run();
}

async function claimKey(key: string): Promise<NewPublication['idempotency']> {
  const requestHash = await sha256Hex(key);
  await testDb()
    .prepare(
      `INSERT INTO idempotency_keys (scope, key, request_hash, status, created_at, expires_at)
       VALUES ('4242', ?1, ?2, 'in_flight', ?3, ?4)`
    )
    .bind(key, requestHash, NOW, NOW + 60_000)
    .run();
  return { scope: '4242', key, requestHash, claimedAt: NOW };
}

async function newPublication(overrides: Partial<NewPublication> = {}): Promise<NewPublication> {
  const id = crypto.randomUUID();
  return {
    id,
    jobId: crypto.randomUUID(),
    postId: POST,
    postRevision: 1,
    destinationId: DESTINATION,
    scheduledAt: NOW + 60_000,
    timezone: 'UTC',
    now: NOW,
    actor: '4242',
    idempotency: await claimKey(`key-${id}`),
    response: { status: 202, body: '{"ok":true}' },
    ...overrides
  };
}

async function nothingWritten(key: string): Promise<void> {
  expect(await count('publications')).toBe(0);
  expect(await count('jobs')).toBe(0);
  expect(await count('audit_log')).toBe(0);
  // The key is still ours and unfinished: the caller releases it and reports why.
  expect(await count('idempotency_keys', `key = '${key}' AND status = 'in_flight'`)).toBe(1);
}

describe('create guards (a change after the use case read the state must write nothing)', () => {
  it('writes publication, job, audit row and the stored response when every guard holds', async () => {
    await seedPost();
    await seedDestination();
    const input = await newPublication();

    expect(await createD1PublicationRepository(testDb()).create(input)).toBe(true);

    expect(await count('publications')).toBe(1);
    expect(await count('jobs', "status = 'pending'")).toBe(1);
    expect(await count('audit_log')).toBe(1);
    expect(await count('idempotency_keys', `key = '${input.idempotency.key}' AND status = 'completed'`)).toBe(1);
  });

  it.each([
    ['the post is still a draft', () => seedPost({ status: 'draft' }), () => seedDestination()],
    ['the post is at another revision', () => seedPost({ revision: 2 }), () => seedDestination()],
    [
      'the post is archived',
      async () => {
        await seedPost();
        await testDb().prepare('UPDATE posts SET archived_at = ?1 WHERE id = ?2').bind(NOW, POST).run();
      },
      () => seedDestination()
    ],
    ['the post does not exist', async () => undefined, () => seedDestination()],
    ['the destination is disabled', () => seedPost(), () => seedDestination(0)],
    ['the destination does not exist', () => seedPost(), async () => undefined]
  ])('refuses when %s', async (_name, seedPostState, seedDestinationState) => {
    await seedPostState();
    await seedDestinationState();
    const input = await newPublication();

    expect(await createD1PublicationRepository(testDb()).create(input)).toBe(false);

    await nothingWritten(input.idempotency.key);
  });

  it('refuses when the idempotency claim is not ours', async () => {
    await seedPost();
    await seedDestination();
    const input = await newPublication({
      idempotency: { scope: '4242', key: 'never-claimed', requestHash: 'a'.repeat(64), claimedAt: NOW }
    });

    expect(await createD1PublicationRepository(testDb()).create(input)).toBe(false);

    expect(await count('publications')).toBe(0);
    expect(await count('jobs')).toBe(0);
    expect(await count('audit_log')).toBe(0);
  });
});

describe('constraints', () => {
  it('rejects a publication for a post revision that does not exist', async () => {
    await seedPost();
    await seedDestination();

    await expect(
      testDb()
        .prepare(
          `INSERT INTO publications (id, post_id, post_revision, destination_id, scheduled_at, timezone, created_at, updated_at)
           VALUES (?1, ?2, 9, ?3, ?4, 'UTC', ?4, ?4)`
        )
        .bind(crypto.randomUUID(), POST, DESTINATION, NOW)
        .run()
    ).rejects.toThrow(/FOREIGN KEY/);
  });

  it('allows one job per publication through the unique dedupe key', async () => {
    await seedPost();
    await seedDestination();
    const input = await newPublication();
    await createD1PublicationRepository(testDb()).create(input);

    await expect(
      testDb()
        .prepare(
          `INSERT INTO jobs (id, kind, publication_id, status, run_at, dedupe_key, publication_scheduled_at, created_at, updated_at)
           VALUES (?1, 'publish', ?2, 'pending', ?3, ?4, ?3, ?3, ?3)`
        )
        .bind(crypto.randomUUID(), input.id, NOW, `publish:${input.id}`)
        .run()
    ).rejects.toThrow(/UNIQUE constraint failed: jobs.dedupe_key/);
  });

  it('rejects a job status the state machine does not know', async () => {
    await expect(
      testDb()
        .prepare(
          `INSERT INTO jobs (id, kind, status, run_at, dedupe_key, created_at, updated_at)
           VALUES (?1, 'publish', 'sent', ?2, 'x', ?2, ?2)`
        )
        .bind(crypto.randomUUID(), NOW)
        .run()
    ).rejects.toThrow(/CHECK constraint failed/);
  });
});

describe('publication list query plans', () => {
  const after = { scheduledAt: NOW, id: CURSOR_ID };
  const base = { limit: 21, now: NOW };

  const jobLookup = 'SEARCH j USING INDEX jobs_publication_idx';
  const publicationLookup = /SEARCH p USING (COVERING )?INDEX sqlite_autoindex_publications_1/;
  const byStatus = 'SEARCH j USING INDEX jobs_status_scheduled_idx (status=?';

  // A TEMP B-TREE would mean the list sorts; a SCAN of jobs would mean it reads the whole queue.
  it.each([
    ['no filter, first page', {}, 'SCAN p USING INDEX publications_scheduled_idx', jobLookup],
    ['no filter, next page', { after }, 'SEARCH p USING INDEX publications_scheduled_idx', jobLookup],
    ['post filter', { postId: POST }, 'SEARCH p USING INDEX publications_post_idx', jobLookup],
    ['post filter, next page', { postId: POST, after }, 'SEARCH p USING INDEX publications_post_idx', jobLookup],
    [
      'destination filter',
      { destinationId: DESTINATION },
      'SEARCH p USING INDEX publications_destination_idx',
      jobLookup
    ],
    [
      'destination filter, next page',
      { destinationId: DESTINATION, after },
      'SEARCH p USING INDEX publications_destination_idx',
      jobLookup
    ],
    ['status filter (scheduled)', { status: 'scheduled' as const }, byStatus, publicationLookup],
    ['status filter (unknown)', { status: 'unknown' as const }, byStatus, publicationLookup],
    ['status filter, next page', { status: 'queued' as const, after }, byStatus, publicationLookup],
    [
      'sent and post filters',
      { status: 'sent' as const, postId: POST },
      'SEARCH p USING INDEX publications_post_idx',
      jobLookup
    ],
    ['rare status and post filters', { status: 'unknown' as const, postId: POST }, byStatus, publicationLookup],
    [
      'rare status and destination filters',
      { status: 'failed' as const, destinationId: DESTINATION },
      byStatus,
      publicationLookup
    ],
    [
      'status, post and destination filters',
      { status: 'cancelled' as const, postId: POST, destinationId: DESTINATION },
      byStatus,
      publicationLookup
    ]
  ])('%s walks an index without sorting', async (_name, query, expected, lookup) => {
    const { sql, bindings } = listPublicationsSql({ ...base, ...query });

    const { results } = await testDb()
      .prepare(`EXPLAIN QUERY PLAN ${sql}`)
      .bind(...bindings)
      .all<{ detail: string }>();

    const plan = results.map((row) => row.detail).join('\n');
    expect(plan).toContain(expected);
    expect(plan).toMatch(lookup);
    expect(plan).not.toContain('TEMP B-TREE');
  });

  it('reads one publication through its primary key and its job through the publication index', async () => {
    const { results } = await testDb()
      .prepare(
        `EXPLAIN QUERY PLAN SELECT p.id FROM publications p CROSS JOIN jobs j ON j.publication_id = p.id AND j.kind = 'publish' WHERE p.id = ?1`
      )
      .bind(CURSOR_ID)
      .all<{ detail: string }>();

    const plan = results.map((row) => row.detail).join('\n');
    expect(plan).toMatch(/SEARCH p USING (COVERING )?INDEX sqlite_autoindex_publications_1/);
    expect(plan).toContain('SEARCH j USING INDEX jobs_publication_idx');
  });
});

describe('job query plans the dispatcher will use (BACKEND §5)', () => {
  const plan = async (sql: string, ...bindings: (string | number)[]) => {
    const { results } = await testDb()
      .prepare(`EXPLAIN QUERY PLAN ${sql}`)
      .bind(...bindings)
      .all<{ detail: string }>();
    return results.map((row) => row.detail).join('\n');
  };

  it.each([
    ['not started: back to retry_wait', 'send_started_at IS NULL'],
    ['started: becomes unknown', 'send_started_at IS NOT NULL']
  ])('reconcile of an expired lease, %s, searches the claimed-lease index', async (_name, started) => {
    const detail = await plan(
      `SELECT id FROM jobs WHERE status = 'claimed' AND lease_until < ?1 AND ${started} LIMIT 50`,
      NOW
    );

    expect(detail).toContain('SEARCH jobs USING INDEX jobs_claimed_lease (status=? AND lease_until<?)');
  });

  // The WHERE must repeat the partial index's predicate literally: SQLite cannot prove that
  // `status = 'pending'` implies `status IN ('pending', 'retry_wait')`, and then it falls back to
  // jobs_status_scheduled_idx and reads every pending job. The sort in a TEMP B-TREE covers only
  // the due rows of the covering index, never the table or the future schedule.
  it('due selection uses the partial due index, covering, only for the due range', async () => {
    const detail = await plan(
      `SELECT id FROM jobs WHERE status IN ('pending', 'retry_wait') AND run_at <= ?1 ORDER BY run_at, id LIMIT 10`,
      NOW
    );

    expect(detail).toContain('SEARCH jobs USING COVERING INDEX jobs_due (status=? AND run_at<?)');
    expect(detail).not.toContain('jobs_status_scheduled_idx');
  });

  it('the claim UPDATE finds its job by primary key', async () => {
    const detail = await plan(
      `UPDATE jobs SET status = 'claimed', attempts = attempts + 1, lease_until = ?1, updated_at = ?2
       WHERE id = ?3 AND status IN ('pending', 'retry_wait') AND run_at <= ?2 AND (lease_until IS NULL OR lease_until < ?2)`,
      NOW + 1,
      NOW,
      CURSOR_ID
    );

    expect(detail).toContain('SEARCH jobs USING INDEX sqlite_autoindex_jobs_1 (id=?)');
  });
});

describe('a rare status stays bounded however long the history is', () => {
  const HISTORY = 3_000;

  // Bulk-seeds `HISTORY` sent publications and a handful of other states with recursive CTEs, so
  // the counts below are measured on a table that is large relative to a page.
  async function seedHistory(): Promise<void> {
    await seedPost();
    await seedDestination();
    const db = testDb();
    const rare = ['unknown', 'failed', 'retry_wait', 'cancelled', 'pending'];
    await db.batch([
      db
        .prepare(
          `WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < ?1)
           INSERT INTO publications (id, post_id, post_revision, destination_id, scheduled_at, timezone, created_at, updated_at)
           SELECT printf('%08d-0000-4000-8000-000000000000', i), ?2, 1, ?3, ?4 + i, 'UTC', ?4, ?4 FROM n`
        )
        .bind(HISTORY, POST, DESTINATION, NOW - 10_000_000),
      db
        .prepare(
          `INSERT INTO jobs (id, kind, publication_id, status, run_at, dedupe_key, publication_scheduled_at, created_at, updated_at)
           SELECT printf('%08d-0000-4000-8000-000000000001', i), 'publish', printf('%08d-0000-4000-8000-000000000000', i),
                  'succeeded', ?1 + i, 'publish:' || i, ?1 + i, ?1, ?1
           FROM (WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < ?2) SELECT i FROM n)`
        )
        .bind(NOW - 10_000_000, HISTORY),
      // The newest rows are the interesting ones, as they would be in real use.
      ...rare.map((status, index) =>
        db
          .prepare(`UPDATE jobs SET status = ?1 WHERE id = printf('%08d-0000-4000-8000-000000000001', ?2)`)
          .bind(status, HISTORY - index * 500)
      )
    ]);
  }

  it.each(['unknown', 'failed', 'retry_wait', 'cancelled', 'scheduled', 'queued', 'preparing', 'sending'] as const)(
    'reads about a page of rows for status %s over a long history of sent publications',
    async (status) => {
      await seedHistory();
      const { sql, bindings } = listPublicationsSql({ status, limit: 21, now: NOW });

      const result = await testDb()
        .prepare(sql)
        .bind(...bindings)
        .all();

      // Index entries plus the job and publication rows for each match: a few reads per result,
      // never anything proportional to the 3 000 sent rows.
      expect(result.meta.rows_read).toBeLessThan(40);
    }
  );

  // Everything is on one post and one destination, like a single main channel.
  it.each([
    ['destination', { destinationId: DESTINATION }],
    ['post', { postId: POST }],
    ['post and destination', { postId: POST, destinationId: DESTINATION }]
  ])('stays bounded for a rare status combined with the %s filter', async (_name, filters) => {
    await seedHistory();
    for (const status of ['unknown', 'failed', 'retry_wait', 'cancelled', 'scheduled', 'queued'] as const) {
      const { sql, bindings } = listPublicationsSql({ status, limit: 21, now: NOW, ...filters });

      const result = await testDb()
        .prepare(sql)
        .bind(...bindings)
        .all();

      expect(result.meta.rows_read, status).toBeLessThan(40);
    }
  });

  it('finds the rare rows and pages the common status in page-sized reads, with or without a filter', async () => {
    await seedHistory();
    const repo = createD1PublicationRepository(testDb());

    expect((await repo.list({ status: 'unknown', limit: 21, now: NOW })).map((row) => row.job.status)).toEqual([
      'unknown'
    ]);
    for (const filters of [{}, { destinationId: DESTINATION }, { postId: POST }]) {
      const { sql, bindings } = listPublicationsSql({ status: 'sent', limit: 21, now: NOW, ...filters });
      const page = await testDb()
        .prepare(sql)
        .bind(...bindings)
        .all();
      expect(page.results, JSON.stringify(filters)).toHaveLength(21);
      expect(page.meta.rows_read, JSON.stringify(filters)).toBeLessThan(100);
    }
  });

  it("reads only a quiet destination's rows for sent next to a busy main channel", async () => {
    await seedHistory();
    const quiet = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
    const db = testDb();
    await db.batch([
      db
        .prepare(
          `INSERT INTO destinations (id, title, chat_id, kind, enabled, revision, created_at, updated_at)
           VALUES (?1, 'Q', '-1002', 'group', 1, 0, ?2, ?2)`
        )
        .bind(quiet, NOW),
      ...[1, 2].map((i) =>
        db
          .prepare(
            `INSERT INTO publications (id, post_id, post_revision, destination_id, scheduled_at, timezone, created_at, updated_at)
             VALUES (printf('%08d-0000-4000-8000-0000000000aa', ?1), ?2, 1, ?3, ?4, 'UTC', ?4, ?4)`
          )
          .bind(i, POST, quiet, NOW - 20_000_000 + i)
      ),
      ...[1, 2].map((i) =>
        db
          .prepare(
            `INSERT INTO jobs (id, kind, publication_id, status, run_at, dedupe_key, publication_scheduled_at, created_at, updated_at)
             VALUES (printf('%08d-0000-4000-8000-0000000000ab', ?1), 'publish', printf('%08d-0000-4000-8000-0000000000aa', ?1),
                     'succeeded', ?2, 'publish:quiet:' || ?1, ?2, ?2, ?2)`
          )
          .bind(i, NOW - 20_000_000 + i)
      )
    ]);

    const { sql, bindings } = listPublicationsSql({ status: 'sent', destinationId: quiet, limit: 21, now: NOW });
    const page = await db
      .prepare(sql)
      .bind(...bindings)
      .all();

    expect(page.results).toHaveLength(2);
    expect(page.meta.rows_read).toBeLessThan(40);
  });
});

describe('jobs.publication_scheduled_at follows publications.scheduled_at', () => {
  async function mismatches(): Promise<number> {
    return count(
      'jobs j JOIN publications p ON p.id = j.publication_id',
      'j.publication_scheduled_at IS NOT p.scheduled_at'
    );
  }

  it('is equal after create and after a reschedule through the repository', async () => {
    await seedPost();
    await seedDestination();
    const repo = createD1PublicationRepository(testDb());
    const input = await newPublication();
    await repo.create(input);
    expect(await mismatches()).toBe(0);

    await repo.reschedule({
      id: input.id,
      expectedRevision: 0,
      scheduledAt: NOW + 9_000,
      timezone: 'UTC',
      actor: '4242',
      now: NOW
    });

    expect(await mismatches()).toBe(0);
    expect(await count('jobs', `publication_scheduled_at = ${NOW + 9_000}`)).toBe(1);
  });

  it('cannot drift through a raw UPDATE of the publication, and ignores other columns', async () => {
    await seedPost();
    await seedDestination();
    const input = await newPublication();
    await createD1PublicationRepository(testDb()).create(input);

    await testDb().prepare('UPDATE publications SET timezone = ?2 WHERE id = ?1').bind(input.id, 'Asia/Tokyo').run();
    expect(await count('jobs', `publication_scheduled_at = ${input.scheduledAt}`)).toBe(1);

    await testDb()
      .prepare('UPDATE publications SET scheduled_at = ?2 WHERE id = ?1')
      .bind(input.id, NOW + 1)
      .run();

    expect(await mismatches()).toBe(0);
    expect(await count('jobs', `publication_scheduled_at = ${NOW + 1}`)).toBe(1);
  });
});

describe('status filter and projectPublicationStatus agree', () => {
  // The SQL form and the TypeScript projection are written separately; every job shape that
  // matters (each state, due or not, started or not, and the run_at == now edge) must land in the
  // same status through both, so the list filter can never disagree with the status shown.
  const shapes = JOB_STATES_FOR_TESTS.flatMap((status) =>
    [NOW - 1, NOW, NOW + 1].flatMap((runAt) =>
      [null, NOW - 5].map((sendStartedAt) => ({ status, runAt, sendStartedAt }))
    )
  );

  it('returns exactly the publications whose projection equals the filter', async () => {
    await seedPost();
    await seedDestination();
    const db = testDb();
    const repo = createD1PublicationRepository(db);
    const created: { id: string; job: (typeof shapes)[number] }[] = [];
    for (const [index, shape] of shapes.entries()) {
      const id = crypto.randomUUID();
      created.push({ id, job: shape });
      await db.batch([
        db
          .prepare(
            `INSERT INTO publications (id, post_id, post_revision, destination_id, scheduled_at, timezone, created_at, updated_at)
             VALUES (?1, ?2, 1, ?3, ?4, 'UTC', ?5, ?5)`
          )
          .bind(id, POST, DESTINATION, NOW + index, NOW),
        db
          .prepare(
            `INSERT INTO jobs (id, kind, publication_id, status, run_at, send_started_at, dedupe_key, publication_scheduled_at, created_at, updated_at)
             VALUES (?1, 'publish', ?2, ?3, ?4, ?5, ?6, ?8, ?7, ?7)`
          )
          .bind(
            crypto.randomUUID(),
            id,
            shape.status,
            shape.runAt,
            shape.sendStartedAt,
            `publish:${id}`,
            NOW,
            NOW + index
          )
      ]);
    }

    const statuses: PublicationStatus[] = [
      'scheduled',
      'queued',
      'preparing',
      'sending',
      'sent',
      'retry_wait',
      'failed',
      'unknown',
      'cancelled'
    ];
    for (const status of statuses) {
      const rows = await repo.list({ status, limit: 100, now: NOW });
      const expected = created
        .filter(({ job }) => projectPublicationStatus(job, NOW) === status)
        .map(({ id }) => id)
        .sort();
      expect(rows.map((row) => row.id).sort(), status).toEqual(expected);
      expect(expected.length, `${status} is exercised`).toBeGreaterThan(0);
    }
  });
});

describe('claim races the owner actions', () => {
  it('does not claim a job a cancel has already taken (no due scan sees a cancelled job)', async () => {
    await seedPost();
    await seedDestination();
    const input = await newPublication({ scheduledAt: NOW });
    const repo = createD1PublicationRepository(testDb());
    await repo.create(input);

    const outcome = await repo.cancel({ id: input.id, expectedRevision: 0, actor: '4242', now: NOW });
    const job = await testDb()
      .prepare('SELECT id FROM jobs WHERE publication_id = ?1')
      .bind(input.id)
      .first<{ id: string }>();

    expect(outcome.applied).toBe(true);
    expect(await claimJob(job?.id ?? '', NOW, NOW + 60_000)).toBe(0);
  });
});

describe('summarizeByPost', () => {
  // Every job state, with the variants the projection looks at: the same mapping as the list statuses.
  const variants = [
    { status: 'pending', runAt: NOW + 1_000, sendStartedAt: null },
    { status: 'pending', runAt: NOW - 1_000, sendStartedAt: null },
    { status: 'claimed', runAt: NOW - 1_000, sendStartedAt: null },
    { status: 'claimed', runAt: NOW - 1_000, sendStartedAt: NOW },
    { status: 'retry_wait', runAt: NOW + 1_000, sendStartedAt: null },
    { status: 'succeeded', runAt: NOW - 1_000, sendStartedAt: NOW },
    { status: 'failed', runAt: NOW - 1_000, sendStartedAt: null },
    { status: 'unknown', runAt: NOW - 1_000, sendStartedAt: NOW },
    { status: 'cancelled', runAt: NOW - 1_000, sendStartedAt: null }
  ] as const;

  it('counts every job state under the status the API projects for it', async () => {
    await seedPost();
    await seedDestination();
    const repo = createD1PublicationRepository(testDb());
    const expected: PublicationStatus[] = [];
    for (const variant of variants) {
      const input = await newPublication();
      await repo.create(input);
      await testDb()
        .prepare('UPDATE jobs SET status = ?2, run_at = ?3, send_started_at = ?4 WHERE publication_id = ?1')
        .bind(input.id, variant.status, variant.runAt, variant.sendStartedAt)
        .run();
      expected.push(projectPublicationStatus(variant, NOW));
    }
    expect(new Set(expected).size).toBe(variants.length);

    const summary = (await repo.summarizeByPost([POST], NOW)).get(POST);

    expect(summary?.counts).toEqual(Object.fromEntries(expected.map((status) => [status, 1])));
  });

  it('is empty for no ids and omits posts without publications', async () => {
    await seedPost();
    const repo = createD1PublicationRepository(testDb());

    expect((await repo.summarizeByPost([], NOW)).size).toBe(0);
    expect((await repo.summarizeByPost([POST], NOW)).size).toBe(0);
  });

  it('reads publications by the post index', async () => {
    const { results } = await testDb()
      .prepare(`EXPLAIN QUERY PLAN ${SUMMARY_SQL}`)
      .bind('["x"]', NOW)
      .all<{ detail: string }>();

    const plan = results.map((row) => row.detail).join('\n');
    expect(plan).toContain('publications_post_idx');
    expect(plan).not.toMatch(/SCAN (p|publications)\b/);
  });
});
