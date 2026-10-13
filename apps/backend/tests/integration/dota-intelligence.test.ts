import { dotaEventDetailSchema, dotaIntelligenceSchema, postSchema } from '@alexeev/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createD1DotaWatcherRepository, parseOfficialPatchFacts } from '../../src/modules/dota';
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

  it('returns only an already-existing linked draft for a bounded official update', async () => {
    const api = createApi({ clock: fakeClock(START + 5 * MINUTE) });
    const draftResponse = await api.request('/api/v1/posts', {
      method: 'POST',
      headers: { 'idempotency-key': 'dota-linked-draft' },
      json: { title: 'Official update draft', body: '' }
    });
    const draft = postSchema.parse(await draftResponse.json());
    const repo = createD1DotaWatcherRepository(testDb());
    await repo.storeSourceSync({
      sourceKey: 'steam_news',
      items: [
        {
          sourceKey: 'steam_news',
          externalId: 'steam-linked',
          title: 'Official announcement',
          sourceUrl: 'https://store.steampowered.com/news/externalpost/steam_community_announcements/steam-linked',
          publishedAt: START + MINUTE
        }
      ],
      detectedAt: START
    });
    await testDb()
      .prepare('UPDATE dota_update_items SET draft_post_id = ?3 WHERE source_key = ?1 AND external_id = ?2')
      .bind('steam_news', 'steam-linked', draft.id)
      .run();

    const response = await api.request('/api/v1/dota?limit=1');
    const body = dotaIntelligenceSchema.parse(await response.json());

    expect(response.status).toBe(200);
    expect(body.updates).toHaveLength(1);
    expect(body.updates[0]?.linkedDraft).toEqual({ id: draft.id, title: 'Official update draft' });
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

describe('GET /api/v1/dota/updates/:sourceKey/:externalId', () => {
  beforeEach(async () => {
    await resetDb();
    await testDb().batch([
      testDb().prepare('DELETE FROM dota_patch_analyses'),
      testDb().prepare('DELETE FROM dota_source_incidents'),
      testDb().prepare('DELETE FROM dota_update_items'),
      testDb().prepare('DELETE FROM dota_source_state')
    ]);
    await seedSession({ token: OWNER_TOKEN, expiresAt: START + 60 * MINUTE * 60 });
    await seedSession({ token: 'foreign-owner-token', telegramId: '999', expiresAt: START + 60 * MINUTE * 60 });
  });

  it('is owner-only, returns not found for absent updates, and reads without upstream work', async () => {
    const api = createApi({ clock: fakeClock(START), db: testDb() });
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    try {
      const anonymous = await api.request('/api/v1/dota/updates/patch_notes/7.41', { token: null });
      expect(anonymous.status).toBe(401);
      const forbidden = await api.request('/api/v1/dota/updates/patch_notes/7.41', { token: 'foreign-owner-token' });
      expect(forbidden.status).toBe(403);
      const missing = await api.request('/api/v1/dota/updates/patch_notes/7.41');
      expect(missing.status).toBe(404);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('returns Steam updates as not applicable and patch updates as persisted facts or pending', async () => {
    const repo = createD1DotaWatcherRepository(testDb());
    await repo.storeSourceSync({
      sourceKey: 'steam_news',
      items: [
        {
          sourceKey: 'steam_news',
          externalId: 'steam-1',
          title: 'News',
          sourceUrl: 'https://store.steampowered.com/news/externalpost/steam_community_announcements/steam-1',
          publishedAt: START
        }
      ],
      detectedAt: START
    });
    await repo.storeSourceSync({
      sourceKey: 'patch_notes',
      items: [
        {
          sourceKey: 'patch_notes',
          externalId: '7.41',
          title: 'Dota 7.41',
          sourceUrl: 'https://www.dota2.com/patches/7.41',
          publishedAt: START
        }
      ],
      detectedAt: START
    });
    const api = createApi({ clock: fakeClock(START), db: testDb() });

    const steam = await api.request('/api/v1/dota/updates/steam_news/steam-1');
    expect(dotaEventDetailSchema.parse(await steam.json())).toMatchObject({
      parseStatus: 'not_applicable',
      facts: []
    });
    const pending = await api.request('/api/v1/dota/updates/patch_notes/7.41');
    expect(dotaEventDetailSchema.parse(await pending.json())).toMatchObject({
      parseStatus: 'pending',
      facts: []
    });

    await repo.savePatchAnalysis({
      externalId: '7.41',
      parseStatus: 'complete',
      facts: [
        {
          id: 'patch:7.41:hero:0:hero:0:0',
          entityType: 'hero',
          entityName: 'Axe',
          section: 'hero',
          change: 'Attack damage: 10 → 12',
          direction: 'increase',
          before: '10',
          after: '12'
        }
      ]
    });
    const persisted = await api.request('/api/v1/dota/updates/patch_notes/7.41');
    expect(dotaEventDetailSchema.parse(await persisted.json())).toMatchObject({
      parseStatus: 'complete',
      facts: [{ id: 'patch:7.41:hero:0:hero:0:0', entityName: 'Axe' }]
    });
    const queryPlan = await testDb()
      .prepare(
        `EXPLAIN QUERY PLAN SELECT parse_status, facts_json FROM dota_patch_analyses
         WHERE source_key = ?1 AND external_id = ?2`
      )
      .bind('patch_notes', '7.41')
      .all<{ detail: string }>();
    expect(queryPlan.results.map((row) => row.detail).join(' ')).toContain('sqlite_autoindex_dota_patch_analyses_1');

    await repo.storeSourceSync({
      sourceKey: 'patch_notes',
      items: [
        {
          sourceKey: 'patch_notes',
          externalId: '7.42',
          title: 'Dota 7.42',
          sourceUrl: 'https://www.dota2.com/patches/7.42',
          publishedAt: START + 1
        }
      ],
      detectedAt: START + 1
    });
    await repo.savePatchAnalysis({ externalId: '7.42', parseStatus: 'incomplete', facts: [], parsedAt: START + 2 });
    const incomplete = await api.request('/api/v1/dota/updates/patch_notes/7.42');
    expect(dotaEventDetailSchema.parse(await incomplete.json())).toMatchObject({
      parseStatus: 'incomplete',
      facts: []
    });
  });
});

describe('parseOfficialPatchFacts', () => {
  const names = { heroes: new Map([[1, 'Axe']]), items: new Map<number, string>() };

  it('extracts bounded deterministic allowlisted facts without inventing source locations', () => {
    const result = parseOfficialPatchFacts(
      {
        patch_number: '7.41',
        patch_name: '7.41',
        heroes: [{ hero_id: 1, hero_notes: [{ note: 'attack damage increased from 10 to 12' }] }]
      },
      '7.41',
      names
    );

    expect(result.status).toBe('complete');
    expect(result.facts[0]).toMatchObject({
      id: 'patch:7.41:hero:0:hero:0:0',
      entityType: 'hero',
      entityName: 'Axe',
      section: 'hero',
      direction: 'increase',
      before: '10',
      after: '12'
    });
    expect(result.facts[0]?.change).toContain('10');
    expect(result.facts[0]?.change).toContain('12');
  });

  it('marks mixed recognized and unknown notes incomplete without persisting excerpts', () => {
    const result = parseOfficialPatchFacts(
      {
        patch_number: '7.41',
        patch_name: '7.41',
        heroes: [
          {
            hero_id: 1,
            hero_notes: [{ note: 'damage increased by 10' }, { note: 'A narrative change that is not recognized' }]
          }
        ]
      },
      '7.41',
      names
    );

    expect(result.status).toBe('incomplete');
    expect(result.facts).toHaveLength(1);
    expect(result.unknownNoteCount).toBe(1);
    expect(result.unresolvedEntityCount).toBe(0);
    expect(JSON.stringify(result)).not.toContain('narrative change');
  });

  it('marks an all-unrecognized patch incomplete even when no fact can be returned', () => {
    const result = parseOfficialPatchFacts(
      {
        patch_number: '7.41',
        patch_name: '7.41',
        heroes: [
          {
            hero_id: 1,
            hero_notes: [{ note: 'Some undocumented adjustment' }]
          }
        ]
      },
      '7.41',
      names
    );
    expect(result).toMatchObject({ status: 'incomplete', facts: [], unknownNoteCount: 1 });
  });

  it('marks unresolved entities incomplete separately from unrecognized notes', () => {
    const result = parseOfficialPatchFacts(
      {
        patch_number: '7.41',
        patch_name: '7.41',
        heroes: [
          {
            hero_id: 999,
            hero_notes: [{ note: 'damage increased by 10' }]
          }
        ]
      },
      '7.41',
      names
    );
    expect(result).toMatchObject({
      status: 'incomplete',
      facts: [],
      unknownNoteCount: 0,
      unresolvedEntityCount: 1
    });
  });

  it('uses no_recognized_facts only when the valid patch contains no notes', () => {
    const result = parseOfficialPatchFacts({ patch_number: '7.41', patch_name: '7.41', heroes: [] }, '7.41', names);
    expect(result).toMatchObject({
      status: 'no_recognized_facts',
      facts: [],
      unknownNoteCount: 0,
      unresolvedEntityCount: 0
    });
  });

  it('caps returned facts at 500 and marks dropped facts incomplete', () => {
    const notes = Array.from({ length: 200 }, () => ({ note: 'damage increased by 10' }));
    const result = parseOfficialPatchFacts(
      {
        patch_number: '7.41',
        patch_name: '7.41',
        heroes: [1, 2, 3].map((hero_id) => ({ hero_id, hero_notes: notes }))
      },
      '7.41',
      {
        heroes: new Map([
          [1, 'Axe'],
          [2, 'Bane'],
          [3, 'Crystal Maiden']
        ]),
        items: new Map()
      }
    );
    expect(result.facts).toHaveLength(500);
    expect(result.status).toBe('incomplete');
    expect(result.truncatedFactCount).toBe(100);
  });
});
