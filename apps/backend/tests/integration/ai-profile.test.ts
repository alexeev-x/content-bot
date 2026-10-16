import { aiAuthorProfileSchema } from '@alexeev/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { authorStateText, rankLabel } from '../../src/modules/ai';
import { expectError } from '../helpers/expect-error';
import { createApi, fakeClock, OWNER_TOKEN, resetDb, seedSession } from '../helpers/harness';

// OpenDota answers for one account: Герой 2 with Dota Plus, public matches and three heroes.
const openDota: typeof fetch = async (input) => {
  const url = String(input);
  if (url.endsWith('/players/337578062')) return Response.json({ profile: { plus: true }, rank_tier: 42 });
  if (url.endsWith('/players/337578062/wl')) return Response.json({ win: 60, lose: 40 });
  if (url.endsWith('/players/337578062/heroes'))
    return Response.json([
      { hero_id: '68', games: 30, win: 18 },
      { hero_id: 111, games: 25, win: 10 },
      { hero_id: 2, games: 0, win: 0 }
    ]);
  if (url.endsWith('/heroes'))
    return Response.json([
      { id: 68, localized_name: 'Ancient Apparition' },
      { id: 111, localized_name: 'Oracle' }
    ]);
  return new Response('nope', { status: 500 });
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
  it('starts from the seed, saves under a revision and reads Dota into the prompt state', async () => {
    const api = createApi({ clock: fakeClock(), contentFetch: openDota });
    const seed = aiAuthorProfileSchema.parse(await (await api.request('/api/v1/ai/profile')).json());
    expect(seed).toMatchObject({ revision: 0, dota: null, dotaAccountId: null });
    // Without an account there is nothing to read.
    await expectError(await api.request('/api/v1/ai/profile/dota', { method: 'POST' }), 503, 'UNAVAILABLE');

    const saved = await api.request('/api/v1/ai/profile', { method: 'PUT', json: { revision: 0, ...FIELDS } });
    expect(aiAuthorProfileSchema.parse(await saved.json())).toMatchObject({ revision: 1, hours: 750 });
    await expectError(
      await api.request('/api/v1/ai/profile', { method: 'PUT', json: { revision: 0, ...FIELDS } }),
      409,
      'CONFLICT'
    );

    const synced = aiAuthorProfileSchema.parse(
      await (await api.request('/api/v1/ai/profile/dota', { method: 'POST' })).json()
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
