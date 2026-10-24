import { beforeEach, describe, expect, it } from 'vitest';
import { createContainer } from '../../src/app/container';
import { skipDullHotfix } from '../../src/app/workflows/source-event-hotfix';
import { type AiTextProvider, createD1AiRepository, updateAiSettings } from '../../src/modules/ai';
import type { DotaDraftSource } from '../../src/modules/dota';
import { testDb } from '../helpers/db';
import { fakeClock, OWNER_ID, resetDb } from '../helpers/harness';
import { testMediaBucket } from '../helpers/media-bucket';

// A Steam «Dota 2 Update» gets a post only when there is something for a player in it (owner, 22.10.2026): a dull one
// costs one cheap call and no post; the owner's own request and anything else are always written.

const source = (title: string) => ({ externalId: '6001', title, publishedAt: 0 }) as unknown as DotaDraftSource;
const announcement = async () => ({ text: 'Fixed a tooltip.', images: [], pages: [] });
let calls: number;

const container = (worth: boolean) =>
  createContainer(
    { DB: testDb(), MEDIA_BUCKET: testMediaBucket(), OWNER_TELEGRAM_ID: OWNER_ID },
    {
      clock: fakeClock(),
      aiProvider: {
        provider: 'openai',
        complete: async () => {
          calls += 1;
          return {
            text: JSON.stringify({ worth, reason: worth ? 'награды события' : 'мелочи' }),
            model: 'gpt-6-luna',
            usage: { inputTokens: 100, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 10 }
          };
        }
      } satisfies AiTextProvider
    }
  );

beforeEach(async () => {
  await resetDb();
  calls = 0;
  await updateAiSettings(
    { repo: createD1AiRepository(testDb()), clock: fakeClock() },
    {
      revision: 0,
      provider: 'openai',
      enabled: true,
      draftModel: 'gpt-6.1-sol',
      cheapModel: 'gpt-6-luna',
      videoReviews: false,
      prices: [],
      monthlyBudgetUsd: 5,
      dailyCapUsd: 1,
      warnAtPercent: 80
    }
  );
});

const check = (worth: boolean, title: string, automatic: boolean) =>
  skipDullHotfix(
    container(worth),
    { id: crypto.randomUUID(), externalId: '6001', automatic },
    source(title),
    't',
    () => {},
    announcement
  );

describe('a Dota 2 Update hotfix', () => {
  it('is skipped when nothing in it is for a player, written when something is', async () => {
    expect(await check(false, 'Dota 2 Update - 7/1/2026', true)).toBe(true);
    expect(await check(true, 'Dota 2 Update - 7/1/2026', true)).toBe(false);
    expect(calls).toBe(2);
  });

  it('never stops the owner’s own request, a patch or a news post, and asks no model for them', async () => {
    expect(await check(false, 'Dota 2 Update - 7/1/2026', false)).toBe(false);
    expect(await check(false, '7.41f Gameplay Patch', true)).toBe(false);
    expect(calls).toBe(0);
  });
});
