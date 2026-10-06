import { beforeEach, describe, expect, it } from 'vitest';
import { testDb } from '../../../../tests/helpers/db';
import { resetDb, START } from '../../../../tests/helpers/harness';
import { createD1DestinationRepository, listDestinationsSql } from './d1-destination-repository';

beforeEach(resetDb);

const after = { title: 'Main', id: '0b1f6c52-8d3e-4a47-9a35-2f6f0c1d7e90' };

describe('destination list query plans', () => {
  // A SCAN of the table or a TEMP B-TREE would mean the list sorts or reads everything.
  it.each([
    ['no filter, first page', {}, 'SCAN destinations USING INDEX destinations_title_idx'],
    ['no filter, next page', { after }, 'SEARCH destinations USING INDEX destinations_title_idx'],
    ['enabled filter, first page', { enabled: true }, 'SEARCH destinations USING INDEX destinations_enabled_title_idx'],
    [
      'disabled filter, next page',
      { enabled: false, after },
      'SEARCH destinations USING INDEX destinations_enabled_title_idx'
    ]
  ])('%s walks an index without sorting', async (_name, query, expected) => {
    const { sql, bindings } = listDestinationsSql({ ...query, limit: 21 });

    const { results } = await testDb()
      .prepare(`EXPLAIN QUERY PLAN ${sql}`)
      .bind(...bindings)
      .all<{ detail: string }>();

    const plan = results.map((row) => row.detail).join('\n');
    expect(plan).toContain(expected);
    expect(plan).not.toContain('TEMP B-TREE');
  });
});

describe('create guard', () => {
  it('writes nothing when the idempotency claim is not ours', async () => {
    const db = testDb();

    const outcome = await createD1DestinationRepository(db).create({
      record: {
        id: crypto.randomUUID(),
        title: 'T',
        chatId: '-1001',
        kind: 'channel',
        enabled: true,
        revision: 0,
        createdAt: START,
        updatedAt: START
      },
      actor: '4242',
      idempotency: { scope: '4242', key: 'never-claimed', requestHash: 'a'.repeat(64), claimedAt: START },
      response: { status: 201, body: '{}' }
    });

    expect(outcome).toBe('claim_lost');
    for (const table of ['destinations', 'audit_log']) {
      const row = await db.prepare(`SELECT count(*) AS n FROM ${table}`).first<{ n: number }>();
      expect(row?.n, table).toBe(0);
    }
  });
});
