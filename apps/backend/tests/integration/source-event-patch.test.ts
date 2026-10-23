import { describe, expect, it } from 'vitest';
import { sourceEventWriter } from '../../src/app/workflows/source-event-ai-draft';
import {
  createOfficialDotaFetcher,
  type DotaDraftSource,
  digestOfficialPatch,
  patchNotesText,
  type PatchDigest
} from '../../src/modules/dota';

// A patch announcement is written from Valve's notes of its version (owner, 22.10.2026: one post — the main change
// first, then who was cut and buffed, then the items), linked to the patch page; without notes, from the announcement.

const source = (title: string): DotaDraftSource =>
  ({
    sourceKey: 'steam_news',
    externalId: '5001',
    title,
    sourceUrl: 'https://store.steampowered.com/news/5001',
    publishedAt: Date.parse('2026-03-24T20:00:00Z'),
    excerpt: null,
    eventType: 'news',
    draftPostId: null,
    isBaseline: false
  }) as unknown as DotaDraftSource;

const DIGEST: PatchDigest = {
  version: '7.41',
  general: [{ title: 'Facets', notes: ['Facets removed from the game'] }],
  heroes: [{ name: 'Pudge', notes: ['Meat Hook damage reduced from 300 to 250'] }],
  items: [{ name: 'Black King Bar', notes: ['Cost increased from 4050 to 4200'] }],
  neutralItems: [],
  noteCount: 3
};

const writer = (
  title: string,
  digest: PatchDigest | null,
  announcements: string[],
  condensePatch?: (notes: string) => Promise<string | null>
) =>
  sourceEventWriter({
    ...(condensePatch === undefined ? {} : { condensePatch }),
    repo: {
      findSteamAnnouncement: async () => source(title),
      setAiGeneration: async () => {},
      finishAiDraft: async () => {}
    },
    fetchAnnouncement: async () => {
      announcements.push(title);
      return { text: 'Patch 7.41 is out now, notes here.', images: [], pages: [] };
    },
    findOfficialUrl: async () => null,
    digestPatch: async (version) => (version === '7.41' ? digest : null),
    onError: () => {}
  });

describe('a patch post', () => {
  it('is written from the notes of its version, the main change first, linked to the patch page', async () => {
    const fetched: string[] = [];
    const { task, facts } = await writer('7.41 Gameplay Patch', DIGEST, fetched).task('5001');
    expect(task).toContain('https://www.dota2.com/patches/7.41');
    expect(task).toContain('Затем главное изменение');
    expect(task).toContain('«🔴 Порезали сильнее всех»');
    expect(task).toContain('«🟡 Почти не изменили»');
    expect(facts?.indexOf('Facets removed from the game')).toBeLessThan(facts?.indexOf('Pudge') ?? 0);
    expect(facts).toContain('Black King Bar');
    // Valve's notes, not the announcement's few lines.
    expect(fetched).toEqual([]);
  });

  it('falls back to the announcement while Valve has no notes for the version, and news stays news', async () => {
    const fetched: string[] = [];
    expect((await writer('7.41 Gameplay Patch', null, fetched).task('5001')).facts).toContain('Patch 7.41 is out now');
    expect((await writer('Inside the Trove of Terror', DIGEST, fetched).task('5001')).task).not.toContain('patches/');
    expect(fetched).toHaveLength(2);
  });
});

describe('the facts a patch post is written from', () => {
  // 7.41f on DEV (owner, 23.10.2026): a short digest kept three cut heroes, and the post said there were no buffs.
  const heroes = Array.from({ length: 35 }, (_, index) => ({
    name: `Hero ${index + 1}`,
    notes: [`Attack damage increased by ${index + 1}`, 'Base armor reduced by 1']
  }));

  it('carry every hero and item of a letter patch whole', async () => {
    const { facts } = await writer('7.41 Gameplay Patch', { ...DIGEST, heroes }, [], async () => 'never asked').task(
      '5001'
    );
    for (const hero of heroes) expect(facts).toContain(hero.name);
    expect(facts).not.toContain('never asked');
  });

  it('carry the cheap model reading of a big patch, or the notes cut when it fails', async () => {
    const big = heroes.map((hero) => ({ ...hero, notes: Array.from({ length: 12 }, () => 'x'.repeat(120)) }));
    const read: number[] = [];
    const condensed = await writer('7.41 Gameplay Patch', { ...DIGEST, heroes: big }, [], async (notes) => {
      read.push(notes.length);
      return 'Hero 1 (усилен): урон 10 → 12';
    }).task('5001');
    expect(read[0]).toBeGreaterThan(40_000);
    expect(condensed.facts).toContain('Hero 1 (усилен)');
    const failed = await writer('7.41 Gameplay Patch', { ...DIGEST, heroes: big }, [], async () => null).task('5001');
    expect(failed.facts?.length).toBeLessThanOrEqual(40_100);
    expect(failed.facts).toContain('Hero 1');
  });
});

describe("Valve's patch notes", () => {
  it('read even when Valve leaves some item names empty (37 items, 22.10.2026)', async () => {
    const json = (body: unknown) => Response.json(body);
    const fetcher = createOfficialDotaFetcher((async (input: string | URL) => {
      const url = String(input);
      if (url.includes('herolist'))
        return json({ result: { data: { heroes: [{ id: 14, name_english_loc: 'Pudge' }] } } });
      if (url.includes('itemlist'))
        return json({
          result: {
            data: {
              itemabilities: [
                { id: 116, name_english_loc: 'Black King Bar' },
                { id: 999, name_english_loc: '', name_loc: '' }
              ]
            }
          }
        });
      return json({
        patch_number: '7.41',
        patch_name: '7.41',
        general_notes: [
          { title: 'Global Changes', generic: [{ note: 'Facets removed from the game' }, { note: '<br>' }] }
        ],
        heroes: [{ hero_id: 14, hero_notes: [{ note: 'Base Armor increased by 1' }] }],
        items: [{ ability_id: 116, ability_notes: [{ note: 'Cost increased from 4050 to 4200' }] }]
      });
    }) as unknown as typeof fetch);
    const digest = await digestOfficialPatch(fetcher, '7.41');
    // Valve's spacer notes stay in the digest; its text for the writer drops them.
    expect(patchNotesText(digest!, 40_000)).not.toMatch(/^- $/m);
    expect(digest).toMatchObject({
      general: [{ title: 'Global Changes', notes: ['Facets removed from the game', '<br>'] }],
      heroes: [{ name: 'Pudge' }],
      items: [{ name: 'Black King Bar' }]
    });
  });
});
