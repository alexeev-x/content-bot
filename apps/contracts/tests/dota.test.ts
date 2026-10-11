import { describe, expect, it } from 'vitest';
import { dotaIntelligenceSchema, listDotaIntelligenceQuerySchema } from '../src/dota';

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
});
