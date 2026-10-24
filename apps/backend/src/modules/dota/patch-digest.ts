// What a patch post is written from (owner, 22.10.2026: one post per patch — the main change first, then who was cut
// or buffed the most, then the items that changed most, the rest left to the patch page). Valve's own notes, grouped
// and ranked by how much changed; the writer judges buffs and nerfs from them, all of them (owner, 23.10.2026).

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
  /** Talent notes among the heroes' (the patch picture's «Таланты героев»). */
  talentNotes?: number;
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

/** Valve's note as plain text: its markup and runs of spaces go. */
const clean = (note: string) =>
  note
    .replace(/<[^>]{1,200}>/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Valve's whole notes of the patch for the writer (owner, 23.10.2026: «он должен получать максимальные данные»): every
 * general note, every hero and item with all its notes, the most changed first. A hero cut by a short digest was why
 * 7.41f's post found no buffs. Over `max` the end is cut (neutral items, then items); the caller condenses a bigger patch first.
 */
export function patchNotesText(digest: PatchDigest, max: number): string {
  const general = digest.general.flatMap((group) => {
    const notes = group.notes.map(clean).filter((note) => note !== '');
    return notes.length === 0
      ? []
      : [...(group.title === '' ? [] : [`[${group.title}]`]), ...notes.map((note) => `- ${note}`)];
  });
  const section = (title: string, entities: PatchEntityNotes[]) =>
    entities.length === 0
      ? null
      : `${title} (всего: ${entities.length}; больше всего изменений — первыми):\n${[...entities]
          .sort((a, b) => b.notes.length - a.notes.length)
          .map((entity) => `${entity.name}:\n${entity.notes.map((note) => `  - ${clean(note)}`).join('\n')}`)
          .join('\n')}`;
  const text = [
    general.length === 0
      ? 'Общих изменений нет.'
      : `ГЛАВНОЕ — общие изменения Valve (с них начинай):\n${general.join('\n')}`,
    section('Герои', digest.heroes),
    section('Предметы', digest.items),
    section('Нейтральные предметы', digest.neutralItems)
  ]
    .filter((part): part is string => part !== null)
    .join('\n\n');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** A general section of Valve's notes by its title (7.39–7.41: «Map Objectives», «Terrain Changes», «Captains Mode»). */
const MAP_SECTION = /\b(?:map|terrain|objectives?)\b/i;
const MODE_SECTION = /\b(?:mode|turbo|ranked|matchmaking)\b/i;

/**
 * The patch picture's points (owner, 22.10.2026): the heaviest 3–4 of heroes, items, the map, mechanics and modes, by
 * how many heroes or items changed and how many notes the general sections have. A patch with fewer than three of them
 * (7.41f: heroes and items only) adds talents and neutral items (owner, 23.10.2026: at least three). Russian captions
 * of two words.
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
  const heaviest = (list: [string, number][]) =>
    list
      .filter(([, weight]) => weight > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([caption]) => caption);
  const points = heaviest(weights).slice(0, 4);
  if (points.length >= 3) return points;
  const extras = heaviest([
    ['Таланты героев', digest.talentNotes ?? 0],
    ['Нейтральные предметы', digest.neutralItems.length]
  ]);
  return [...points, ...extras].slice(0, 4);
}
