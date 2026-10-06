import { beforeEach, describe, expect, it } from 'vitest';
import { testDb } from '../../../../tests/helpers/db';
import { resetDb, START } from '../../../../tests/helpers/harness';
import { count } from '../../../../tests/helpers/publishing';
import { createIdempotencyStore } from '../../../platform/idempotency/d1-idempotency-store';
import { AppError } from '../../../shared/app-error';
import { createD1DestinationRepository } from '../infrastructure/d1-destination-repository';
import { createD1PublicationRepository } from '../infrastructure/d1-publication-repository';
import { createPublication, type CreatePublicationDeps } from './create-publication';
import type { DestinationRepository, PostSource } from './ports';

beforeEach(resetDb);

const POST = '5d4f8a7e-3b6c-4e2a-9f10-1a2b3c4d5e6f';
const DESTINATION = '7e6d5c4b-3a29-4180-8f7e-6d5c4b3a2918';

async function seed(): Promise<void> {
  const db = testDb();
  await db.batch([
    db
      .prepare(
        `INSERT INTO posts (id, title, body, status, revision, created_at, updated_at) VALUES (?1, 'T', 'B', 'approved', 1, ?2, ?2)`
      )
      .bind(POST, START),
    db
      .prepare(
        `INSERT INTO post_revisions (post_id, revision, title, body, status, created_at) VALUES (?1, 0, 'T', 'B', 'draft', ?2)`
      )
      .bind(POST, START),
    db
      .prepare(
        `INSERT INTO post_revisions (post_id, revision, title, body, status, created_at) VALUES (?1, 1, 'T', 'B', 'approved', ?2)`
      )
      .bind(POST, START),
    db
      .prepare(
        `INSERT INTO destinations (id, title, chat_id, kind, enabled, revision, created_at, updated_at)
         VALUES (?1, 'D', '-1001', 'channel', 1, 0, ?2, ?2)`
      )
      .bind(DESTINATION, START)
  ]);
}

const posts: PostSource = {
  async findState(postId) {
    const row = await testDb()
      .prepare('SELECT status, revision FROM posts WHERE id = ?1')
      .bind(postId)
      .first<{ status: 'draft' | 'approved'; revision: number }>();
    return row;
  }
};

function deps(destinations: DestinationRepository): CreatePublicationDeps {
  const db = testDb();
  return {
    publications: createD1PublicationRepository(db),
    destinations,
    posts,
    idempotency: createIdempotencyStore(db),
    now: START,
    newId: () => crypto.randomUUID()
  };
}

const command = {
  actor: '4242',
  idempotencyKey: 'race',
  input: {
    postId: POST,
    revision: 1,
    destinationId: DESTINATION,
    scheduledAt: new Date(START + 60_000).toISOString(),
    timezone: 'UTC'
  }
};

describe('createPublication when the destination changes between the check and the write', () => {
  it('writes nothing, says why, and frees the key', async () => {
    await seed();
    const real = createD1DestinationRepository(testDb());
    // The destination is read as enabled; a concurrent PATCH disables it before our batch runs.
    const racing: DestinationRepository = {
      ...real,
      async findById(id) {
        const found = await real.findById(id);
        await testDb().prepare('UPDATE destinations SET enabled = 0 WHERE id = ?1').bind(id).run();
        return found;
      }
    };

    const failure = await createPublication(deps(racing), command).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(AppError);
    expect(failure).toMatchObject({ code: 'CONFLICT', details: { reason: 'DESTINATION_DISABLED' } });
    expect(await count('publications')).toBe(0);
    expect(await count('jobs')).toBe(0);
    expect(await count('audit_log')).toBe(0);
    expect(await count('idempotency_keys')).toBe(0);
  });

  it('does not store a success for the key when the guarded write was refused', async () => {
    await seed();
    const real = createD1DestinationRepository(testDb());
    const racing: DestinationRepository = {
      ...real,
      async findById(id) {
        const found = await real.findById(id);
        await testDb().prepare('UPDATE destinations SET enabled = 0 WHERE id = ?1').bind(id).run();
        return found;
      }
    };
    await createPublication(deps(racing), command).catch(() => undefined);
    await testDb().prepare('UPDATE destinations SET enabled = 1 WHERE id = ?1').bind(DESTINATION).run();

    const retried = await createPublication(deps(real), command);

    expect(retried.status).toBe('scheduled');
    expect(await count('publications')).toBe(1);
  });
});
