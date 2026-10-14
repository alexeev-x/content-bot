import { beforeEach, describe, expect, it } from 'vitest';
import { resetDb, START } from '../../../../tests/helpers/harness';
import { testDb } from '../../../../tests/helpers/db';
import { createD1PostRepository, listPostsSql } from './d1-post-repository';

beforeEach(resetDb);

const after = { at: START, id: '0b1f6c52-8d3e-4a47-9a35-2f6f0c1d7e90' };

describe('list query plans', () => {
  // A SCAN of the table or a TEMP B-TREE would mean the list sorts or reads everything.
  it.each([
    ['live, no filter, first page', { view: 'live' as const }, ['SCAN posts USING INDEX posts_updated_idx']],
    [
      'live, status filter, first page',
      { view: 'live' as const, status: 'draft' as const },
      ['SEARCH posts USING INDEX posts_status_updated_idx']
    ],
    ['live, no filter, next page', { view: 'live' as const, after }, ['SEARCH posts USING INDEX posts_updated_idx']],
    [
      'live, status filter, next page',
      { view: 'live' as const, status: 'approved' as const, after },
      ['SEARCH posts USING INDEX posts_status_updated_idx']
    ],
    ['archive, first page', { view: 'archive' as const }, ['USING INDEX posts_archived_idx']],
    ['archive, next page', { view: 'archive' as const, after }, ['SEARCH posts USING INDEX posts_archived_idx']]
  ])('%s walks an index without sorting', async (_name, query, expected) => {
    const bindings: (string | number)[] = [];
    if ('status' in query) bindings.push(query.status);
    if ('after' in query) bindings.push(query.after.at, query.after.at, query.after.id);
    bindings.push(21);

    const { results } = await testDb()
      .prepare(`EXPLAIN QUERY PLAN ${listPostsSql(query)}`)
      .bind(...bindings)
      .all<{ detail: string }>();

    const plan = results.map((row) => row.detail).join('\n');
    for (const fragment of expected) expect(plan).toContain(fragment);
    expect(plan).not.toContain('TEMP B-TREE');
  });

  it('counts the archive from its partial index', async () => {
    const { results } = await testDb()
      .prepare(
        'EXPLAIN QUERY PLAN SELECT count(*) AS n FROM posts WHERE archived_at IS NOT NULL AND deleted_at IS NULL'
      )
      .all<{ detail: string }>();

    expect(results.map((row) => row.detail).join('\n')).toContain('posts_archived_idx');
  });
});

describe('create guard', () => {
  it('writes nothing when the idempotency claim is not ours', async () => {
    const db = testDb();
    const repo = createD1PostRepository(db);

    const written = await repo.create({
      record: {
        id: crypto.randomUUID(),
        title: 'T',
        body: '',
        entities: [],
        status: 'draft',
        archivedAt: null,
        revision: 0,
        createdAt: START,
        updatedAt: START
      },
      actor: '4242',
      idempotency: { scope: '4242', key: 'never-claimed', requestHash: 'a'.repeat(64), claimedAt: START },
      response: { status: 201, body: '{}' }
    });

    expect(written).toBe(false);
    for (const table of ['posts', 'post_revisions', 'audit_log']) {
      const row = await db.prepare(`SELECT count(*) AS n FROM ${table}`).first<{ n: number }>();
      expect(row?.n, table).toBe(0);
    }
  });
});

describe('findRevision', () => {
  it('returns the stored snapshot of the asked revision, not the latest one, and null for a missing one', async () => {
    const db = testDb();
    const id = crypto.randomUUID();
    await db.batch([
      db
        .prepare(
          "INSERT INTO posts (id, title, body, status, revision, created_at, updated_at) VALUES (?1, 'New', 'Newer body', 'approved', 1, ?2, ?2)"
        )
        .bind(id, START),
      db
        .prepare(
          "INSERT INTO post_revisions (post_id, revision, title, body, status, created_at) VALUES (?1, 0, 'Old', 'Old body', 'draft', ?2)"
        )
        .bind(id, START),
      db
        .prepare(
          "INSERT INTO post_revisions (post_id, revision, title, body, status, created_at) VALUES (?1, 1, 'New', 'Newer body', 'approved', ?2)"
        )
        .bind(id, START)
    ]);
    const repo = createD1PostRepository(db);

    expect(await repo.findRevision(id, 0)).toEqual({ title: 'Old', body: 'Old body', entities: [], media: [] });
    expect(await repo.findRevision(id, 1)).toEqual({ title: 'New', body: 'Newer body', entities: [], media: [] });
    expect(await repo.findRevision(id, 2)).toBeNull();
    expect(await repo.findRevision(crypto.randomUUID(), 0)).toBeNull();
  });
});

describe('findManyByIds', () => {
  it('returns existing posts in requested order and makes no query for an empty list', async () => {
    const db = testDb();
    const first = crypto.randomUUID();
    const second = crypto.randomUUID();
    await db.batch([
      db
        .prepare(
          "INSERT INTO posts (id, title, body, status, revision, created_at, updated_at) VALUES (?1, 'First', '', 'draft', 0, ?2, ?2)"
        )
        .bind(first, START),
      db
        .prepare(
          "INSERT INTO posts (id, title, body, status, revision, created_at, updated_at) VALUES (?1, 'Second', '', 'draft', 0, ?2, ?2)"
        )
        .bind(second, START)
    ]);

    const posts = await createD1PostRepository(db).findManyByIds([second, crypto.randomUUID(), first]);

    expect(posts.map((post) => post.id)).toEqual([second, first]);
    expect(await createD1PostRepository(db).findManyByIds([])).toEqual([]);
  });
});
