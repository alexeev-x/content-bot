import { applyD1Migrations, env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { testDb } from '../helpers/db';
import { fakeTransport, makeTick, SENT, seedDueJob } from '../helpers/dispatch';
import { createApi, fakeClock, OWNER_TOKEN, resetDb, seedSession, START } from '../helpers/harness';

const MINUTE = 60_000;

describe('publication analytics snapshot migration', () => {
  beforeEach(async () => {
    await resetDb();
    await seedSession({ token: OWNER_TOKEN, expiresAt: START + 86_400_000 });
  });

  it('backfills retained attempts and manual unknown resolutions into immutable report rows', async () => {
    const clock = fakeClock();
    const api = createApi({ clock });
    const sent = await seedDueJob(api);
    await makeTick({ clock, transport: fakeTransport(SENT) }).run();

    const unknown = await seedDueJob(api);
    await makeTick({ clock, transport: fakeTransport({ kind: 'unknown', reason: 'timeout' }) }).run();
    clock.advance(MINUTE);
    const resolution = await api.request(`/api/v1/publications/${unknown.publicationId}/resolve-unknown`, {
      method: 'POST',
      json: { outcome: 'sent', revision: 0, externalMessageId: '9002' }
    });
    expect(resolution.status).toBe(200);

    const migration = env.TEST_MIGRATIONS.find(({ name }) => name === '0025_publication_analytics_snapshots.sql');
    expect(migration).toBeDefined();
    await testDb().prepare('DROP TRIGGER IF EXISTS analytics_snapshot_after_job_attempt').run();
    await testDb().prepare('DROP TRIGGER IF EXISTS analytics_snapshot_after_unknown_resolution').run();
    await testDb().prepare('DROP TABLE analytics_snapshots').run();
    await testDb().prepare('DELETE FROM d1_migrations WHERE name = ?1').bind(migration?.name).run();
    await applyD1Migrations(testDb(), migration === undefined ? [] : [migration]);

    const rows = await testDb()
      .prepare(
        `SELECT publication_id, observation_kind, outcome FROM analytics_snapshots
         WHERE publication_id IN (?1, ?2) ORDER BY publication_id, observed_at, snapshot_id`
      )
      .bind(sent.publicationId, unknown.publicationId)
      .all<{ publication_id: string; observation_kind: string; outcome: string | null }>();
    expect(rows.results).toEqual(
      expect.arrayContaining([
        { publication_id: sent.publicationId, observation_kind: 'backfill', outcome: 'sent' },
        { publication_id: unknown.publicationId, observation_kind: 'backfill', outcome: 'unknown' },
        { publication_id: unknown.publicationId, observation_kind: 'backfill', outcome: 'sent' }
      ])
    );
  });
});
