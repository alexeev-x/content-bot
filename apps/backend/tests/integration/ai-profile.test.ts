import { aiAuthorProfileSchema } from '@alexeev/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { authorStateText, rankLabel } from '../../src/modules/ai';
import { expectError } from '../helpers/expect-error';
import { createApi, fakeClock, OWNER_TOKEN, resetDb, seedSession } from '../helpers/harness';

// What the studio reads from OpenDota in the owner's browser: Герой 2 with Dota Plus and two heroes.
const SNAPSHOT = {
  rankTier: 42,
  plus: true,
  publicMatchData: true,
  wins: 60,
  losses: 40,
  topHeroes: [
    { id: 68, name: 'Ancient Apparition', games: 30, winRate: 0.6 },
    { id: 111, name: 'Oracle', games: 25, winRate: 0.4 }
  ]
};

const FIELDS = {
  dotaAccountId: '337578062',
  hours: 750,
  learningHeroes: ['Оракл'],
  unknownAspects: 'тайминги Рошана',
  experiments: '',
  notes: 'стрим в пятницу'
};

beforeEach(async () => {
  await resetDb();
  await seedSession({ token: OWNER_TOKEN });
});

describe('«Обо мне»', () => {
  it('starts from the seed, saves under a revision and stores a Dota read for the prompt state', async () => {
    const api = createApi({ clock: fakeClock() });
    const seed = aiAuthorProfileSchema.parse(await (await api.request('/api/v1/ai/profile')).json());
    expect(seed).toMatchObject({ revision: 0, dota: null, dotaAccountId: null });
    // Without an account a read has nobody to belong to; a malformed read is refused.
    await expectError(
      await api.request('/api/v1/ai/profile/dota', { method: 'POST', json: SNAPSHOT }),
      409,
      'CONFLICT'
    );
    await expectError(
      await api.request('/api/v1/ai/profile/dota', { method: 'POST', json: { ...SNAPSHOT, rankTier: 'Герой' } }),
      400,
      'VALIDATION_ERROR'
    );

    const saved = await api.request('/api/v1/ai/profile', { method: 'PUT', json: { revision: 0, ...FIELDS } });
    expect(aiAuthorProfileSchema.parse(await saved.json())).toMatchObject({ revision: 1, hours: 750 });
    await expectError(
      await api.request('/api/v1/ai/profile', { method: 'PUT', json: { revision: 0, ...FIELDS } }),
      409,
      'CONFLICT'
    );

    const synced = aiAuthorProfileSchema.parse(
      await (await api.request('/api/v1/ai/profile/dota', { method: 'POST', json: SNAPSHOT })).json()
    );
    expect(synced.dota).toMatchObject({
      rankTier: 42,
      rankLabel: 'Герой 2',
      plus: true,
      publicMatchData: true,
      topHeroes: [
        { name: 'Ancient Apparition', games: 30, winRate: 0.6 },
        { name: 'Oracle', games: 25, winRate: 0.4 }
      ]
    });
    // The owner's fields stay as saved; the revision is the owner's, a Dota read does not bump it.
    expect(synced).toMatchObject({ revision: 1, unknownAspects: 'тайминги Рошана' });

    const state = authorStateText(synced);
    expect(state).toContain('Ранг: Герой 2');
    expect(state).toContain('около 750 часов');
    expect(state).toContain('Пока не понимает в игре: тайминги Рошана');
    expect(state).toContain('Ancient Apparition (30 игр, 60% побед)');
  });

  it('names OpenDota rank tiers', () => {
    expect(rankLabel(42)).toBe('Герой 2');
    expect(rankLabel(80)).toBe('Титан');
    expect(rankLabel(null)).toBeNull();
    expect(rankLabel(0)).toBeNull();
  });
});
