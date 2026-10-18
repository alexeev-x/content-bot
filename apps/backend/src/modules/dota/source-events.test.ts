import { describe, expect, it } from 'vitest';
import {
  buildEventDraft,
  changedEntities,
  classifyDotaEvent,
  cleanExcerpt,
  firstSentence,
  watchKey,
  type SourceEventType
} from './source-events';

describe('classifyDotaEvent', () => {
  const cases: [string, 'steam_news' | 'patch_notes', string, string | null, SourceEventType][] = [
    ['patch notes are patches', 'patch_notes', 'Dota 7.41', null, 'patch'],
    ['a patch note stays a patch whatever it says', 'patch_notes', 'Treasure fix', null, 'patch'],
    ['treasure in the title', 'steam_news', 'Treasure of the Cryptic Beacon is live', null, 'treasure'],
    ['treasure in the body only', 'steam_news', 'New in the store', 'The new Treasure brings sets', 'treasure'],
    ["collector's cache", 'steam_news', "Collector's Cache 2026", null, 'treasure'],
    ['a cosmetic set', 'steam_news', 'Spring update', 'A new cosmetic set for Pudge', 'treasure'],
    ['Russian wording', 'steam_news', 'Новая сокровищница', null, 'treasure'],
    ['plain news', 'steam_news', 'The International 2026 qualifiers', 'Teams are set.', 'news'],
    ['"sets" as a verb is not a treasure', 'steam_news', 'Dota Plus update', 'This sets the stage for TI', 'news']
  ];
  it.each(cases)('%s', (_name, sourceKey, title, excerpt, expected) => {
    expect(classifyDotaEvent({ sourceKey, title, excerpt })).toBe(expected);
  });
});

describe('cleanExcerpt and firstSentence', () => {
  it('drops tags, links and image macros and keeps the text', () => {
    const raw =
      '[p]Hello [b]world[/b]. See https://example.com/x[/p] {STEAM_CLAN_IMAGE}/1/a.png [img]x.png[/img] <i>More</i>';
    expect(cleanExcerpt(raw)).toBe('Hello world. See More');
    expect(cleanExcerpt('[img]a.png[/img]')).toBeNull();
    expect(cleanExcerpt(undefined)).toBeNull();
  });
  it('takes the first sentence, bounded', () => {
    expect(firstSentence('One. Two.')).toBe('One.');
    expect(firstSentence('No end')).toBe('No end');
    expect(firstSentence('x'.repeat(400))?.length).toBe(240);
    expect(firstSentence(null)).toBeNull();
  });
});

describe('buildEventDraft', () => {
  const base = {
    externalId: '7.41',
    title: 'Dota 7.41',
    excerpt: null,
    sourceUrl: 'https://www.dota2.com/patches/7.41'
  };
  const entities = (n: number) => Array.from({ length: n }, (_, i) => ({ kind: 'hero' as const, name: `Hero ${i}` }));

  it('patch: watched first, capped at 15 with «и ещё N», link, no invented facts', () => {
    const watched = new Set([watchKey('hero', 'hero 19')]);
    const draft = buildEventDraft({ ...base, type: 'patch' }, entities(20), watched);
    // No post title: the heading is the bold first line of the body, sent once.
    expect(draft.title).toBeUndefined();
    expect(draft.body.startsWith('Патч 7.41: что изменилось\n\n')).toBe(true);
    expect(draft.entities).toEqual([{ type: 'bold', offset: 0, length: 'Патч 7.41: что изменилось'.length }]);
    const lines = draft.body.split('\n');
    expect(lines.filter((line) => line.startsWith('— '))).toHaveLength(15);
    expect(lines.find((line) => line.startsWith('— '))).toBe('— Hero 19 (герой)');
    expect(draft.body).toContain('и ещё 5');
    expect(draft.body).toContain('Источник: https://www.dota2.com/patches/7.41');
  });
  it('patch without parsed facts says so instead of inventing a list', () => {
    expect(buildEventDraft({ ...base, type: 'patch' }, []).body).toContain('пока не разобран');
  });
  it('treasure: title, one-line summary, link', () => {
    const draft = buildEventDraft(
      {
        ...base,
        type: 'treasure',
        title: 'Cryptic Beacon',
        excerpt: 'New sets are here. Enjoy.',
        sourceUrl: 'https://s/1'
      },
      []
    );
    expect(draft).toEqual({
      body: 'Новая сокровищница: Cryptic Beacon\n\nNew sets are here.\n\nИсточник: https://s/1',
      entities: [{ type: 'bold', offset: 0, length: 'Новая сокровищница: Cryptic Beacon'.length }],
      kind: 'text'
    });
  });
  it('news: title, first sentence, link', () => {
    const draft = buildEventDraft(
      {
        ...base,
        type: 'news',
        title: 'TI qualifiers',
        excerpt: 'Teams are set. More later.',
        sourceUrl: 'https://s/2'
      },
      []
    );
    expect(draft.body).toBe('TI qualifiers\n\nTeams are set.\n\nИсточник: https://s/2');
  });
  it('changedEntities lists each hero and item once and skips general facts', () => {
    expect(
      changedEntities([
        { entityType: 'general', entityName: 'General' },
        { entityType: 'hero', entityName: 'Axe' },
        { entityType: 'hero', entityName: 'axe' },
        { entityType: 'neutral_item', entityName: 'Trident' },
        { entityType: 'item', entityName: 'Blink' }
      ])
    ).toEqual([
      { kind: 'hero', name: 'Axe' },
      { kind: 'item', name: 'Trident' },
      { kind: 'item', name: 'Blink' }
    ]);
  });
});
