import { beforeEach, describe, expect, it } from 'vitest';
import { testDb } from '../helpers/db';
import { resetDb } from '../helpers/harness';

beforeEach(resetDb);

async function plan(statement: string, ...bindings: number[]): Promise<string> {
  const { results } = await testDb()
    .prepare(`EXPLAIN QUERY PLAN ${statement}`)
    .bind(...bindings)
    .all<{ detail: string }>();
  return results.map((row) => row.detail).join(' | ');
}

describe('archive scans use the partial index', () => {
  it('count and retention purge are answered from posts_archived_idx', async () => {
    expect(await plan('SELECT count(*) FROM posts WHERE archived_at IS NOT NULL AND deleted_at IS NULL')).toContain(
      'posts_archived_idx'
    );
    expect(
      await plan(
        `SELECT id FROM posts WHERE deleted_at IS NULL AND archived_at IS NOT NULL AND archived_at <= ?1
         ORDER BY archived_at, id LIMIT ?2`,
        1,
        10
      )
    ).toContain('posts_archived_idx');
  });
});
