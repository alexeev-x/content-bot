// What a patch post is written from (owner, 22.10.2026: one post per patch — the main change first, then who was cut
// or buffed the most, then the items that changed most, the rest left to the patch page). Valve's own notes, grouped
// and ranked by how much changed; the writer judges buffs and nerfs from them.

const GENERAL_LINES_MAX = 30;
const HEROES_MAX = 12;
const HERO_NOTES_MAX = 3;
const ITEMS_MAX = 10;
const ITEM_NOTES_MAX = 2;
const NOTE_MAX = 220;
/** A hero's or item's note in its line: enough to tell what changed. */
const ENTITY_NOTE_MAX = 120;
const DIGEST_MAX = 3_400;
/** The characters each section may take of the digest. */
const ROOM = { general: 1_250, heroes: 1_250, items: 600, neutral: 350 } as const;

export interface PatchEntityNotes {
  name: string;
  notes: string[];
}

export interface PatchDigest {
  version: string;
  /** Valve's general notes by their section title: facets removed, a mechanic, the map, modes. */
  general: { title: string; notes: string[] }[];
  heroes: PatchEntityNotes[];
  items: PatchEntityNotes[];
  neutralItems: PatchEntityNotes[];
  /** Every note of the patch, the size that tells a small patch from a big one. */
  noteCount: number;
}

/** The patch version an announcement title names: «7.41f Gameplay Patch», «Update 7.37 Is Here», «… in the 7.38 …». */
export function patchVersionOf(title: string): string | null {
  // A hotfix's date («Dota 2 Update - 10.09.2025») is no version.
  if (!/\b(?:patch|update)\b/i.test(title) || isHotfixTitle(title)) return null;
  return /\b(\d\.\d{2}[a-z]?)\b/i.exec(title)?.[1]?.toLowerCase() ?? null;
}

/** A Steam «Dota 2 Update - 7/1/2026»: a hotfix without a patch number. */
export const isHotfixTitle = (title: string): boolean => /^dota 2 update\b/i.test(title.trim());

const clip = (note: string, max = NOTE_MAX) => {
  const text = note
    .replace(/<[^>]{1,200}>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

/** The digest as the writer's facts: the general notes whole, the most changed heroes and items with their notes. */
export function patchDigestText(digest: PatchDigest): string {
  const ranked = (entities: PatchEntityNotes[]) => [...entities].sort((a, b) => b.notes.length - a.notes.length);
  const entityLines = (entities: PatchEntityNotes[], max: number, notesMax: number) =>
    ranked(entities)
      .slice(0, max)
      .map(
        (entity) =>
          `${entity.name} (изменений: ${entity.notes.length}): ${entity.notes
            .map((note) => clip(note, ENTITY_NOTE_MAX))
            .filter((note) => note !== '')
            .slice(0, notesMax)
            .join('; ')}`
      );
  // Each section its own room, so a long general part never pushes the heroes and items out.
  const fit = (lines: string[], room: number) => {
    const kept: string[] = [];
    let used = 0;
    for (const line of lines) {
      if (used + line.length + 1 > room) break;
      kept.push(line);
      used += line.length + 1;
    }
    // A section title left without its notes says nothing.
    while (kept.at(-1)?.startsWith('[') === true) kept.pop();
    return kept;
  };
  // The section title once, then its notes; Valve's empty spacer notes are dropped.
  const general = digest.general.flatMap((group) => {
    const notes = group.notes.map((note) => clip(note)).filter((note) => note !== '');
    return notes.length === 0
      ? []
      : [...(group.title === '' ? [] : [`[${group.title}]`]), ...notes.map((note) => `- ${note}`)];
  });
  const neutral = fit(entityLines(digest.neutralItems, 5, 1), ROOM.neutral);
  const parts = [
    general.length === 0
      ? 'Общих изменений нет.'
      : `ГЛАВНОЕ — общие изменения Valve (с них начинай):\n${fit(general.slice(0, GENERAL_LINES_MAX), ROOM.general).join('\n')}`,
    `Герои (больше всего изменений — первыми; всего героев с изменениями: ${digest.heroes.length}):\n${fit(entityLines(digest.heroes, HEROES_MAX, HERO_NOTES_MAX), ROOM.heroes).join('\n')}`,
    `Предметы (всего с изменениями: ${digest.items.length}):\n${fit(entityLines(digest.items, ITEMS_MAX, ITEM_NOTES_MAX), ROOM.items).join('\n')}`,
    neutral.length === 0 ? null : `Нейтральные предметы (всего: ${digest.neutralItems.length}):\n${neutral.join('\n')}`
  ].filter((part): part is string => part !== null);
  const text = parts.join('\n\n');
  return text.length > DIGEST_MAX ? `${text.slice(0, DIGEST_MAX - 1)}…` : text;
}

/** A general section of Valve's notes by its title (7.39–7.41: «Map Objectives», «Terrain Changes», «Captains Mode»). */
const MAP_SECTION = /\b(?:map|terrain|objectives?)\b/i;
const MODE_SECTION = /\b(?:mode|turbo|ranked|matchmaking)\b/i;

/**
 * The patch picture's points (owner, 22.10.2026): the heaviest 3–4 of heroes, items, the map, mechanics and modes, by
 * how many heroes or items changed and how many notes the general sections have. Russian captions of two words.
 */
export function patchPicturePoints(digest: PatchDigest): string[] {
  const sectionNotes = (match: (title: string) => boolean) =>
    digest.general.filter((group) => match(group.title)).reduce((sum, group) => sum + group.notes.length, 0);
  const weights: [string, number][] = [
    ['Баланс героев', digest.heroes.length],
    ['Изменения предметов', digest.items.length + digest.neutralItems.length],
    ['Обновления карты', sectionNotes((title) => MAP_SECTION.test(title))],
    ['Правки механик', sectionNotes((title) => !MAP_SECTION.test(title) && !MODE_SECTION.test(title))],
    ['Режимы игры', sectionNotes((title) => MODE_SECTION.test(title))]
  ];
  return weights
    .filter(([, weight]) => weight > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([caption]) => caption);
}

/** A hotfix's only point: Valve lists fixes in it. */
export const HOTFIX_PICTURE_POINTS: readonly string[] = ['Исправления ошибок'];
