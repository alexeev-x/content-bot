import { dotaIntelligenceSchema } from '@alexeev/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { createD1DotaWatcherRepository } from '../../src/modules/dota';
import { testDb } from '../helpers/db';
import { createApi, fakeClock, OWNER_TOKEN, resetDb, seedSession, START } from '../helpers/harness';

const MINUTE = 60_000;

describe('GET /api/v1/dota', () => {
  beforeEach(async () => {
    await resetDb();
    await testDb().batch([
      testDb().prepare('DELETE FROM dota_source_incidents'),
      testDb().prepare('DELETE FROM dota_update_items'),
      testDb().prepare('DELETE FROM dota_source_state')
    ]);
    await seedSession({ token: OWNER_TOKEN, expiresAt: START + 60 * MINUTE * 60 });
  });

  it('is owner-only, validates its query, and returns persisted source health and official updates without side effects', async () => {
    const db = testDb();
    const repo = createD1DotaWatcherRepository(db);
    await repo.storeSourceSync({
      sourceKey: 'steam_news',
      items: [
        {
          sourceKey: 'steam_news',
          externalId: 'steam-1',
          title: 'Official announcement',
          sourceUrl: 'https://store.steampowered.com/news/externalpost/steam_community_announcements/steam-1',
          publishedAt: START + 2 * MINUTE
        }
      ],
      detectedAt: START
    });
    await db
      .prepare('UPDATE dota_update_items SET draft_post_id = ?3 WHERE source_key = ?1 AND external_id = ?2')
      .bind('steam_news', 'steam-1', crypto.randomUUID())
      .run();
    await repo.recordSourceFailure({
      sourceKey: 'patch_notes',
      code: 'DOTA_SOURCE_SHAPE',
      detectedAt: START,
      id: crypto.randomUUID()
    });
    const api = createApi({ clock: fakeClock(START + 5 * MINUTE), db });

    const anonymous = await api.request('/api/v1/dota', { token: null });
    expect(anonymous.status).toBe(401);
    const invalid = await api.request('/api/v1/dota?limit=101');
    expect(invalid.status).toBe(400);
    const response = await api.request('/api/v1/dota?limit=1');
    expect(response.status).toBe(200);
    const body = dotaIntelligenceSchema.parse(await response.json());

    expect(body.sources).toEqual([
      {
        key: 'steam_news',
        name: 'Steam Community announcements',
        officialUrl: 'https://steamcommunity.com/games/dota2/announcements/',
        lastAttemptAt: new Date(START).toISOString(),
        lastSuccessAt: new Date(START).toISOString(),
        health: 'healthy'
      },
      {
        key: 'patch_notes',
        name: 'Official Dota 2 patch notes',
        officialUrl: 'https://www.dota2.com/patches',
        lastAttemptAt: new Date(START).toISOString(),
        lastSuccessAt: null,
        health: 'degraded',
        openIncident: { code: 'DOTA_SOURCE_SHAPE', occurredAt: new Date(START).toISOString() }
      }
    ]);
    expect(body.updates).toEqual([
      {
        id: 'steam_news:steam-1',
        sourceKey: 'steam_news',
        type: 'news',
        title: 'Official announcement',
        sourceUrl: 'https://store.steampowered.com/news/externalpost/steam_community_announcements/steam-1',
        publishedAt: new Date(START + 2 * MINUTE).toISOString(),
        detectedAt: new Date(START).toISOString(),
        isBaseline: true
      }
    ]);
    expect(await db.prepare('SELECT count(*) AS count FROM posts').first()).toMatchObject({ count: 0 });
    expect(await db.prepare('SELECT count(*) AS count FROM dota_update_items').first()).toMatchObject({ count: 1 });
  });

  it('filters persisted links that do not match their official source and leaves never-checked feeds unverified', async () => {
    const db = testDb();
    const repo = createD1DotaWatcherRepository(db);
    await repo.storeSourceSync({
      sourceKey: 'patch_notes',
      items: [
        {
          sourceKey: 'patch_notes',
          externalId: '7.41',
          title: 'Forged link',
          sourceUrl: 'https://evil.example/patches/7.41',
          publishedAt: START
        }
      ],
      detectedAt: START
    });
    const api = createApi({ db, clock: fakeClock(START) });

    const response = await api.request('/api/v1/dota?source=steam_news');
    const body = dotaIntelligenceSchema.parse(await response.json());

    expect(body.sources.map((source) => source.health)).toEqual(['unverified', 'healthy']);
    expect(body.updates).toEqual([]);
  });

  it('does not call a migration-era seeded source unverified when its check timestamps are unknown', async () => {
    const db = testDb();
    await db
      .prepare('INSERT INTO dota_source_state (source_key, baseline_seeded) VALUES (?1, 1)')
      .bind('steam_news')
      .run();
    const api = createApi({ db, clock: fakeClock(START) });

    const response = await api.request('/api/v1/dota');
    const body = dotaIntelligenceSchema.parse(await response.json());

    expect(body.sources[0]).toMatchObject({
      key: 'steam_news',
      lastAttemptAt: null,
      lastSuccessAt: null,
      health: 'stale'
    });
  });

  it('uses the newest-order index for both all-source and source-filtered bounded lists', async () => {
    const db = testDb();
    const globalPlan = await db
      .prepare(
        `EXPLAIN QUERY PLAN SELECT u.source_key, u.external_id FROM dota_update_items u
         ORDER BY u.published_at DESC, u.source_key ASC, u.external_id ASC LIMIT ?1`
      )
      .bind(50)
      .all<{ detail: string }>();
    const sourcePlan = await db
      .prepare(
        `EXPLAIN QUERY PLAN SELECT u.source_key, u.external_id FROM dota_update_items u
         WHERE u.source_key = ?1 ORDER BY u.published_at DESC, u.source_key ASC, u.external_id ASC LIMIT ?2`
      )
      .bind('steam_news', 50)
      .all<{ detail: string }>();

    expect(globalPlan.results.map((row) => row.detail).join(' ')).toContain('dota_update_items_newest_idx');
    expect(sourcePlan.results.map((row) => row.detail).join(' ')).toContain('dota_update_items_source_newest_idx');
  });
});
