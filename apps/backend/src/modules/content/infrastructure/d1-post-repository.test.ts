import { beforeEach, describe, expect, it } from 'vitest';
import { resetDb, START } from '../../../../tests/helpers/harness';
import { testDb } from '../../../../tests/helpers/db';
import { createD1PostRepository, listPostsSql } from './d1-post-repository';

beforeEach(resetDb);

const after = { updatedAt: START, id: '0b1f6c52-8d3e-4a47-9a35-2f6f0c1d7e90' };

describe('list query plans', () => {
  // A SCAN of the table or a TEMP B-TREE would mean the list sorts or reads everything.
  it.each([
    ['no filter, first page', {}, ['SCAN posts USING INDEX posts_updated_idx']],
    ['status filter, first page', { status: 'draft' as const }, ['SEARCH posts USING INDEX posts_status_updated_idx']],
    ['no filter, next page', { after }, ['SEARCH posts USING INDEX posts_updated_idx']],
    [
      'status filter, next page',
      { status: 'approved' as const, after },
      ['SEARCH posts USING INDEX posts_status_updated_idx']
    ]
  ])('%s walks an index without sorting', async (_name, query, expected) => {
    const bindings: (string | number)[] = [];
    if ('status' in query) bindings.push(query.status);
    if ('after' in query) bindings.push(query.after.updatedAt, query.after.updatedAt, query.after.id);
    bindings.push(21);

    const { results } = await testDb()
      .prepare(`EXPLAIN QUERY PLAN ${listPostsSql(query)}`)
      .bind(...bindings)
      .all<{ detail: string }>();

    const plan = results.map((row) => row.detail).join('\n');
    for (const fragment of expected) expect(plan).toContain(fragment);
    expect(plan).not.toContain('TEMP B-TREE');
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
        status: 'draft',
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
