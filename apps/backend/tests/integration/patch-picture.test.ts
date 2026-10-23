import { beforeEach, describe, expect, it } from 'vitest';
import {
  type AiImageProvider,
  type AiTextProvider,
  createD1AiRepository,
  drawPatchPicture,
  updateAiSettings
} from '../../src/modules/ai';
import { patchPicturePoints } from '../../src/modules/dota';
import { testDb } from '../helpers/db';
import { fakeClock, resetDb } from '../helpers/harness';

// Every patch post carries a drawn picture (owner, 22.10.2026); a second call reads it back and a wrong number or
// caption means another try, at most three (each try is paid), then the post goes without a picture.

const USAGE = { inputTokens: 100, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 10 };
let draws: number;
let reads: { images: number }[];

const images: AiImageProvider = {
  provider: 'openai',
  draw: async ({ references }) => {
    expect(references.length).toBeGreaterThan(0);
    draws += 1;
    return {
      bytes: new Uint8Array([0xff, 0xd8, draws]),
      base64: btoa(String.fromCharCode(0xff, 0xd8, draws)),
      contentType: 'image/jpeg',
      model: 'gpt-image-2.5-sunburst',
      usage: USAGE
    };
  }
};

/** Reads back each picture as the next answer of `answers` (the last one repeats). */
const reader = (answers: { number: string; captions: string[] }[]): AiTextProvider => ({
  provider: 'openai',
  complete: async ({ images: pictures }) => {
    reads.push({ images: pictures?.length ?? 0 });
    const answer = answers[Math.min(reads.length - 1, answers.length - 1)];
    return { text: JSON.stringify(answer), model: 'gpt-6.1-sol', usage: USAGE };
  }
});

const draw = (provider: AiTextProvider | null, points = ['Баланс героев', 'Изменения предметов']) =>
  drawPatchPicture(
    {
      repo: createD1AiRepository(testDb()),
      clock: fakeClock(),
      timezone: 'UTC',
      newId: () => crypto.randomUUID(),
      provider,
      images
    },
    { number: '7.41b', points }
  );

beforeEach(async () => {
  await resetDb();
  draws = 0;
  reads = [];
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

describe('a patch picture', () => {
  it('is redrawn when the read-back differs, and kept once it matches (case, «ё» and line breaks aside)', async () => {
    const result = await draw(
      reader([
        { number: '7.41', captions: ['БАЛАНС ГЕРОЕВ', 'ИЗМЕНЕНИЯ ПРЕДМЕТОВ'] },
        { number: '7.41B', captions: ['БАЛАНС\nГЕРОЕВ', 'ИЗМЕНЕНИЯ ПРЕДМЕТОВ'] }
      ])
    );
    expect(result).toEqual({ kind: 'drawn', bytes: new Uint8Array([0xff, 0xd8, 2]), contentType: 'image/jpeg' });
    expect(draws).toBe(2);
    expect(reads).toEqual([{ images: 1 }, { images: 1 }]);
  });

  it('gives up after three wrong pictures', async () => {
    const result = await draw(
      reader([{ number: '7.41b', captions: ['БАЛАНС ГЕРОЕВ', 'ИЗМЕНЕНИЯ ПРЕДМЕТОВ', 'КАРТА'] }])
    );
    expect(result).toEqual({ kind: 'failed', reason: 'mismatch' });
    expect(draws).toBe(3);
  });

  it('is never drawn without a provider to read it back', async () => {
    expect(await draw(null)).toEqual({ kind: 'failed', reason: 'unavailable' });
    expect(draws).toBe(0);
  });
});

describe('the points of a patch picture', () => {
  it('are the heaviest of heroes, items, the map, mechanics and modes, at most four', () => {
    const notes = (count: number) => Array.from({ length: count }, (_, index) => `note ${index}`);
    const entities = (count: number) =>
      Array.from({ length: count }, (_, index) => ({ name: `e${index}`, notes: ['x'] }));
    expect(
      patchPicturePoints({
        version: '7.40',
        general: [
          { title: 'Captains Mode', notes: notes(8) },
          { title: 'General Changes', notes: notes(25) },
          { title: 'Map Objectives', notes: notes(17) },
          { title: 'Terrain Changes', notes: notes(27) },
          { title: 'Invulnerability Targeting', notes: notes(24) }
        ],
        heroes: entities(120),
        items: entities(49),
        neutralItems: entities(25),
        noteCount: 0
      })
    ).toEqual(['Баланс героев', 'Изменения предметов', 'Правки механик', 'Обновления карты']);
    expect(
      patchPicturePoints({
        version: '7.41a',
        general: [],
        heroes: entities(3),
        items: [],
        neutralItems: [],
        noteCount: 3
      })
    ).toEqual(['Баланс героев']);
  });
});
