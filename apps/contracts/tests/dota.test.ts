import { describe, expect, it } from 'vitest';
import {
  dotaEventDetailSchema,
  dotaIntelligenceSchema,
  dotaUpdateParamsSchema,
  listDotaIntelligenceQuerySchema
} from '../src/dota';
import {
  addDotaWatchlistInputSchema,
  addDotaWatchlistResponseSchema,
  dotaWatchlistsSchema
} from '../src/dota-watchlists';

describe('Dota Intelligence contracts', () => {
  it('accepts a source which has never been verified without inventing timestamps', () => {
    expect(
      dotaIntelligenceSchema.parse({
        sources: [
          {
            key: 'steam_news',
            name: 'Dota 2 — Steam Community',
            officialUrl: 'https://steamcommunity.com/app/570/news/',
            lastAttemptAt: null,
            lastSuccessAt: null,
            health: 'unverified'
          },
          {
            key: 'patch_notes',
            name: 'Dota 2 — Patch notes',
            officialUrl: 'https://www.dota2.com/patches',
            lastAttemptAt: null,
            lastSuccessAt: null,
            health: 'unverified'
          }
        ],
        updates: []
      })
    ).toMatchObject({ updates: [] });
  });

  it('rejects unknown query keys and caps reads at 100 updates', () => {
    expect(listDotaIntelligenceQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
    expect(listDotaIntelligenceQuerySchema.safeParse({ extra: 'ignored' }).success).toBe(false);
  });

  it('accepts a persisted event detail without claiming parse completeness', () => {
    expect(
      dotaEventDetailSchema.parse({
        update: {
          id: 'patch_notes:7.41',
          sourceKey: 'patch_notes',
          type: 'patch',
          title: '7.41',
          sourceUrl: 'https://www.dota2.com/patches/7.41',
          publishedAt: '2026-10-01T00:00:00.000Z',
          detectedAt: '2026-10-01T00:05:00.000Z',
          isBaseline: false
        },
        parseStatus: 'incomplete',
        facts: [
          {
            id: 'patch_notes:7.41:0',
            entityType: 'hero',
            entityName: 'Axe',
            section: 'hero',
            change: 'Броня: 2 → 3',
            direction: 'increase',
            before: '2',
            after: '3'
          }
        ]
      })
    ).toMatchObject({ parseStatus: 'incomplete', facts: [{ entityName: 'Axe' }] });
  });

  it('bounds detail identity and rejects extra path parameters', () => {
    expect(dotaUpdateParamsSchema.safeParse({ sourceKey: 'patch_notes', externalId: '7.41' }).success).toBe(true);
    expect(dotaUpdateParamsSchema.safeParse({ sourceKey: 'patch_notes', externalId: '../private' }).success).toBe(
      false
    );
    expect(dotaUpdateParamsSchema.safeParse({ sourceKey: 'patch_notes', externalId: '7.41', extra: 'x' }).success).toBe(
      false
    );
  });

  it('accepts only add requests that reference a bounded official patch fact', () => {
    expect(
      addDotaWatchlistInputSchema.safeParse({ sourceKey: 'patch_notes', externalId: '7.41', factId: 'f:1' }).success
    ).toBe(true);
    expect(
      addDotaWatchlistInputSchema.safeParse({ sourceKey: 'steam_news', externalId: '123', factId: 'f:1' }).success
    ).toBe(false);
    expect(
      addDotaWatchlistInputSchema.safeParse({ sourceKey: 'patch_notes', externalId: '../private', factId: 'f:1' })
        .success
    ).toBe(false);
  });

  it('accepts persisted watch matches with an explicit non-retryable delivery state', () => {
    const update = {
      id: 'patch_notes:7.41',
      sourceKey: 'patch_notes',
      externalId: '7.41',
      title: '7.41',
      sourceUrl: 'https://www.dota2.com/patches/7.41',
      publishedAt: '2026-10-01T00:00:00.000Z',
      detectedAt: '2026-10-01T00:05:00.000Z'
    };
    const fact = {
      id: 'patch:7.41:hero:1',
      entityType: 'hero',
      entityName: 'Axe',
      section: 'hero',
      change: 'Armor: 2 → 3'
    };
    expect(
      addDotaWatchlistResponseSchema.parse({
        created: true,
        watch: {
          id: '5d4f8a7e-3b6c-4e2a-9f10-1a2b3c4d5e6f',
          entityType: 'hero',
          entityName: 'Axe',
          createdAt: '2026-10-01T00:10:00.000Z',
          lastMatchedUpdate: null
        }
      })
    ).toMatchObject({ created: true, watch: { entityName: 'Axe' } });
    expect(
      dotaWatchlistsSchema.parse({
        watches: [],
        matches: [
          {
            id: '5d4f8a7e-3b6c-4e2a-9f10-1a2b3c4d5e6f',
            watchId: '5d4f8a7e-3b6c-4e2a-9f10-1a2b3c4d5e6f',
            entityType: 'hero',
            entityName: 'Axe',
            update,
            fact,
            alertStatus: 'unknown'
          }
        ]
      })
    ).toMatchObject({ matches: [{ alertStatus: 'unknown' }] });
  });
});
