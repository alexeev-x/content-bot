import { describe, expect, it } from 'vitest';
import { isHotfixTitle, type PatchDigest, patchNotesText, patchVersionOf } from './patch-digest';

// A patch post is written from Valve's notes of its version (owner, 22.10.2026): a missed version writes it from a
// few lines of the announcement, and a digest that buries «facets removed» under hero numbers loses the main news.

describe('patch announcements and digests', () => {
  it('reads the version from the announcement titles Valve used in 2023–2026', () => {
    expect(
      [
        '7.41f Gameplay Patch',
        'Update 7.37 Is Here',
        'Explore Wandering Waters in the 7.38 Gameplay Update',
        'Gameplay Patch 7.41e and Summer Scrub',
        'Introducing Largo and Patch 7.40',
        'Inside the Trove of Terror',
        'Dota 2 Update - 7/1/2026',
        'The International 2026 Compendium 1.25',
        'Dota 2 Update - 10.09.2025'
      ].map(patchVersionOf)
    ).toEqual(['7.41f', '7.37', '7.38', '7.41e', '7.40', null, null, null, null]);
    expect(isHotfixTitle('Dota 2 Update - 7/1/2026')).toBe(true);
    expect(isHotfixTitle('7.41f Gameplay Patch')).toBe(false);
  });

  it('puts the general notes first and the most changed heroes and items before the others', () => {
    const digest: PatchDigest = {
      version: '7.41',
      general: [{ title: 'Facets', notes: ['Facets removed from the game'] }],
      heroes: [
        { name: 'Axe', notes: ['Armor increased from 1 to 2'] },
        { name: 'Pudge', notes: ['a', 'b', 'c'] }
      ],
      items: [{ name: 'Black King Bar', notes: ['Cost increased from 4050 to 4200'] }],
      neutralItems: [],
      noteCount: 6
    };
    const text = patchNotesText(digest, 40_000);
    expect(
      text.startsWith('ГЛАВНОЕ — общие изменения Valve (с них начинай):\n[Facets]\n- Facets removed from the game')
    ).toBe(true);
    expect(text.indexOf('Pudge:')).toBeLessThan(text.indexOf('Axe:'));
    expect(text).toContain('Black King Bar:\n  - Cost increased from 4050 to 4200');
    expect(patchNotesText({ ...digest, general: [] }, 40_000)).toMatch(/^Общих изменений нет\./u);
  });
});
