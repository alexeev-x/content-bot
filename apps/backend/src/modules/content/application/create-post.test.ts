import { beforeEach, describe, expect, it } from 'vitest';
import { testDb } from '../../../../tests/helpers/db';
import { resetDb, START } from '../../../../tests/helpers/harness';
import { createIdempotencyStore } from '../../../platform/idempotency/d1-idempotency-store';
import { createD1PostRepository } from '../infrastructure/d1-post-repository';
import { createPost, type CreatePostDeps } from './create-post';

beforeEach(resetDb);

function deps(): CreatePostDeps {
  const db = testDb();
  return {
    repo: createD1PostRepository(db),
    idempotency: createIdempotencyStore(db),
    now: START,
    newId: () => crypto.randomUUID()
  };
}

async function count(table: string): Promise<number> {
  const row = await testDb().prepare(`SELECT count(*) AS n FROM ${table}`).first<{ n: number }>();
  return row?.n ?? -1;
}

describe('createPost', () => {
  it('keeps the same key independent between two Telegram users', async () => {
    const input = { title: 'Same payload', body: 'Same', entities: [], kind: 'text' as const };

    const mine = await createPost(deps(), { actor: '4242', idempotencyKey: 'shared', input });
    const theirs = await createPost(deps(), { actor: '777', idempotencyKey: 'shared', input });
    const mineAgain = await createPost(deps(), { actor: '4242', idempotencyKey: 'shared', input });

    expect(theirs.id).not.toBe(mine.id);
    expect(mineAgain).toEqual(mine);
    expect(await count('posts')).toBe(2);
    expect(await count('idempotency_keys')).toBe(2);
  });

  it('releases the key when the write fails, so the client can retry at once', async () => {
    // Bypasses the contract validation on purpose: the 201-character title trips the table CHECK
    // and makes the batch throw after the key was claimed.
    const broken = { title: 't'.repeat(201), body: '', entities: [], kind: 'text' as const };

    await expect(createPost(deps(), { actor: '4242', idempotencyKey: 'retry', input: broken })).rejects.toThrow();

    expect(await count('idempotency_keys')).toBe(0);
    expect(await count('posts')).toBe(0);
    const retried = await createPost(deps(), {
      actor: '4242',
      idempotencyKey: 'retry',
      input: { title: 'Fixed', body: '', entities: [], kind: 'text' }
    });
    expect(retried.title).toBe('Fixed');
  });
});
