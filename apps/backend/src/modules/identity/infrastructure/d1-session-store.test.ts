import { beforeEach, describe, expect, it } from 'vitest';
import { testDb } from '../../../../tests/helpers/db';
import { resetDb, START } from '../../../../tests/helpers/harness';
import { createD1SessionStore, ENDED_SESSIONS_SQL } from './d1-session-store';

beforeEach(resetDb);

const DAY = 24 * 60 * 60_000;

describe('ended sessions query', () => {
  it('searches the expiry and the revocation index, one branch per reason', async () => {
    const { results } = await testDb()
      .prepare(`EXPLAIN QUERY PLAN ${ENDED_SESSIONS_SQL}`)
      .bind(START, 100)
      .all<{ detail: string }>();
    const detail = results.map((row) => row.detail).join('\n');

    expect(detail).toContain('sessions_expires_idx');
    expect(detail).toContain('sessions_revoked_idx');
  });
});

describe('purgeEnded', () => {
  const insert = (id: string, values: { expiresAt: number; hardExpiresAt: number; revokedAt?: number }) =>
    testDb()
      .prepare(
        `INSERT INTO sessions (id, token_hash, telegram_id, kind, expires_at, created_at, revoked_at, hard_expires_at)
         VALUES (?1, printf('%064d', length(?1) * 1000 + unicode(?1)), '4242', 'browser', ?2, ?3, ?4, ?5)`
      )
      .bind(id, values.expiresAt, START - 100 * DAY, values.revokedAt ?? null, values.hardExpiresAt)
      .run();

  const ids = async () =>
    (await testDb().prepare('SELECT id FROM sessions ORDER BY id').all<{ id: string }>()).results.map((row) => row.id);

  it('deletes revoked and fully expired sessions past the grace period, with their refresh tokens, and keeps the rest', async () => {
    await insert('a-expired-old', { expiresAt: START - 3 * DAY, hardExpiresAt: START - 2 * DAY });
    await insert('b-revoked-old', {
      expiresAt: START + 30 * DAY,
      hardExpiresAt: START + 60 * DAY,
      revokedAt: START - 2 * DAY
    });
    await insert('c-expired-in-grace', { expiresAt: START - 3_600_000, hardExpiresAt: START - 3_600_000 });
    await insert('d-refreshable', { expiresAt: START - 3 * DAY, hardExpiresAt: START + 30 * DAY });
    await insert('e-live', { expiresAt: START + DAY, hardExpiresAt: START + 30 * DAY });
    await testDb()
      .prepare(
        `INSERT INTO refresh_tokens (token_hash, session_id, created_at, expires_at)
         SELECT printf('%064d', 500 + rowid), id, ?1, ?2 FROM sessions`
      )
      .bind(START - 100 * DAY, START + 30 * DAY)
      .run();

    const purged = await createD1SessionStore(testDb()).purgeEnded({ now: START, limit: 100, graceMs: DAY });

    expect(purged.sessions).toBe(2);
    expect(await ids()).toEqual(['c-expired-in-grace', 'd-refreshable', 'e-live']);
    const tokens = await testDb()
      .prepare('SELECT session_id FROM refresh_tokens ORDER BY session_id')
      .all<{ session_id: string }>();
    expect(tokens.results.map((row) => row.session_id)).toEqual(['c-expired-in-grace', 'd-refreshable', 'e-live']);
  });

  it('a repeated purge deletes nothing more', async () => {
    await insert('a-expired-old', { expiresAt: START - 3 * DAY, hardExpiresAt: START - 2 * DAY });
    const store = createD1SessionStore(testDb());

    expect((await store.purgeEnded({ now: START, limit: 100, graceMs: DAY })).sessions).toBe(1);
    expect((await store.purgeEnded({ now: START, limit: 100, graceMs: DAY })).sessions).toBe(0);
  });
});
