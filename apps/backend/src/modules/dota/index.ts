import { z } from 'zod';
import {
  dotaEventDetailSchema,
  dotaPatchFactSchema,
  dotaPatchParseStatusSchema,
  type DotaEventDetailDto,
  type DotaPatchFactDto,
  type DotaIntelligenceDto,
  type DotaSourceKey as ContractDotaSourceKey
} from '@alexeev/contracts';
import { AppError } from '../../shared/app-error';
import { clipDetail, describeError, describeHttp, describeShape } from '../../shared/feed-diagnostics';
import { eventPageSlugs } from './event-page';
import { classifyDotaEvent, cleanExcerpt, type DotaSourceKey, type SourceEventType } from './source-events';
import type { PatchDigest, PatchEntityNotes } from './patch-digest';

export * from './source-events';
export * from './source-events-repository';
export * from './event-page';
export { fetchStorePrices } from './valve-store';
export {
  findLiquipediaPages,
  isTreasurePage,
  LIQUIPEDIA_IMAGES,
  LIQUIPEDIA_PAGE,
  LIQUIPEDIA_SPACING_MS,
  LIQUIPEDIA_USER_AGENT,
  liquipediaSetIcons,
  parseTreasureWikitext,
  readLiquipediaPage,
  type TreasureFacts
} from './liquipedia';
export * from './series-repository';

export const DOTA_SOURCE_KEYS = ['steam_news', 'patch_notes'] as const;

const steamNewsItemSchema = z
  .object({
    gid: z.string().min(1).max(100),
    title: z.string().trim().min(1).max(500),
    url: z.string().url().max(2048),
    date: z.number().int().nonnegative().max(8_640_000_000_000),
    feedname: z.string().min(1).max(100),
    is_external_url: z.boolean().optional(),
    author: z.string().max(500).optional(),
    contents: z.string().max(10_000).optional(),
    feedlabel: z.string().max(200).optional(),
    feed_type: z.number().int().optional(),
    tags: z.array(z.string().max(100)).max(100).nullable().optional(),
    appid: z.number().int().optional()
  })
  .strict();

const steamNewsSchema = z
  .object({
    appnews: z
      .object({
        appid: z.literal(570),
        count: z.number().int().nonnegative(),
        newsitems: z.array(steamNewsItemSchema).max(100)
      })
      .strict()
  })
  .strict();

const patchSchema = z
  .object({
    patch_number: z.string().trim().min(1).max(40),
    patch_name: z.string().trim().min(1).max(120),
    patch_timestamp: z.number().int().nonnegative().max(8_640_000_000_000),
    patch_website: z.string().max(120).optional(),
    patch_website_anchor: z.string().max(120).optional()
  })
  .strict();

const patchListSchema = z
  .object({
    success: z.literal(true),
    patches: z.array(patchSchema).max(200)
  })
  .strict();

const STEAM_NEWS_URL =
  'https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=570&count=100&maxlength=500&feeds=steam_community_announcements';
const PATCH_LIST_URL = 'https://www.dota2.com/datafeed/patchnoteslist';
const MAX_STEAM_BYTES = 512 * 1024;
const MAX_PATCH_BYTES = 256 * 1024;
const FETCH_TIMEOUT_MS = 8_000;
// Five bound values per item; 20 rows reaches but never exceeds D1's 100-parameter cap.
// D1 allows 100 bound parameters per statement: 7 per Steam row, 5 per patch row.
const STEAM_INSERT_CHUNK_SIZE = 14;
const PATCH_INSERT_CHUNK_SIZE = 20;
/** How far before the newest stored item a sync still sends items (a late or re-dated post). */
const RESYNC_WINDOW_MS = 30 * 24 * 60 * 60_000;

export class DotaWatchError extends Error {
  constructor(
    readonly code:
      'DOTA_SOURCE_FETCH' | 'DOTA_SOURCE_HTTP' | 'DOTA_SOURCE_BODY_LIMIT' | 'DOTA_SOURCE_JSON' | 'DOTA_SOURCE_SHAPE',
    readonly sourceKey: DotaSourceKey,
    readonly httpStatus: number | null = null,
    readonly detail = ''
  ) {
    super(`${code}_${sourceKey}`);
    this.name = 'DotaWatchError';
  }
}

export class DotaPatchDetailError extends Error {
  constructor(
    readonly code:
      | 'DOTA_PATCH_DETAIL_FETCH'
      | 'DOTA_PATCH_DETAIL_HTTP'
      | 'DOTA_PATCH_DETAIL_BODY_LIMIT'
      | 'DOTA_PATCH_DETAIL_JSON'
      | 'DOTA_PATCH_DETAIL_SHAPE',
    readonly externalId: string,
    readonly sourceKey: 'patch_notes' = 'patch_notes'
  ) {
    super(code);
    this.name = 'DotaPatchDetailError';
  }
}

export interface DotaSourceFetcher {
  fetch(source: DotaSourceKey): Promise<Response>;
  fetchPatchDetails(version: string): Promise<Response>;
  fetchPatchNameMaps(): Promise<{ heroes: Map<number, string>; items: Map<number, string> }>;
}

export function createOfficialDotaFetcher(fetchImpl: typeof fetch = fetch): DotaSourceFetcher {
  let nameMapsPromise: Promise<{ heroes: Map<number, string>; items: Map<number, string> }> | null = null;
  return {
    async fetch(source) {
      const url = source === 'steam_news' ? STEAM_NEWS_URL : PATCH_LIST_URL;
      return fetchImpl(url, {
        method: 'GET',
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        redirect: 'manual'
      });
    },
    async fetchPatchDetails(version) {
      const url = new URL('https://www.dota2.com/datafeed/patchnotes');
      url.searchParams.set('version', version);
      url.searchParams.set('language', 'english');
      return fetchImpl(url, {
        method: 'GET',
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        redirect: 'manual'
      });
    },
    async fetchPatchNameMaps() {
      const request = (url: string) =>
        fetchImpl(url, {
          method: 'GET',
          headers: { accept: 'application/json' },
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
          redirect: 'manual'
        });
      if (nameMapsPromise === null) {
        nameMapsPromise = (async () => {
          let responses: [Response, Response];
          try {
            responses = await Promise.all([
              request('https://www.dota2.com/datafeed/herolist?language=english'),
              request('https://www.dota2.com/datafeed/itemlist?language=english')
            ]);
          } catch (error) {
            throw new DotaWatchError('DOTA_SOURCE_FETCH', 'patch_notes', null, describeError(error));
          }
          const [heroPayload, itemPayload] = await Promise.all([
            readBoundedJson(responses[0], 128 * 1024, 'patch_notes'),
            readBoundedJson(responses[1], 384 * 1024, 'patch_notes')
          ]);
          return parsePatchNameMaps(heroPayload, itemPayload);
        })().catch((error: unknown) => {
          nameMapsPromise = null;
          throw error;
        });
      }
      if (nameMapsPromise === null) throw new Error('DOTA_PATCH_NAME_MAPS_UNAVAILABLE');
      return nameMapsPromise;
    }
  };
}

const patchNoteSchema = z.object({ note: z.string().trim().min(1).max(4_000) }).passthrough();
const patchGroupSchema = z.object({ generic: z.array(patchNoteSchema).max(200) }).passthrough();
const patchEntityNotesSchema = z
  .object({
    hero_id: z.number().int().optional(),
    ability_id: z.number().int().optional(),
    is_general_note: z.boolean().optional(),
    title: z.string().max(500).optional(),
    ability_notes: z.array(patchNoteSchema).max(200).optional(),
    hero_notes: z.array(patchNoteSchema).max(200).optional(),
    talent_notes: z.array(patchNoteSchema).max(200).optional(),
    abilities: z
      .array(z.object({ ability_notes: z.array(patchNoteSchema).max(200).optional() }).passthrough())
      .max(200)
      .optional()
  })
  .passthrough();
const patchDetailsSchema = z
  .object({
    patch_number: z.string().trim().min(1).max(40),
    patch_name: z.string().trim().min(1).max(120),
    general_notes: z
      .array(patchGroupSchema.extend({ title: z.string().trim().max(500).optional() }))
      .max(100)
      .optional(),
    heroes: z.array(patchEntityNotesSchema).max(300).optional(),
    items: z.array(patchEntityNotesSchema).max(300).optional(),
    neutral_items: z.array(patchEntityNotesSchema).max(300).optional(),
    neutral_creeps: z
      .array(
        z
          .object({
            name: z.string().trim().max(200).optional(),
            localized_name: z.string().trim().max(200).optional(),
            neutral_creep_notes: z.array(patchNoteSchema).max(200)
          })
          .passthrough()
      )
      .max(100)
      .optional()
  })
  .passthrough();
const patchNamesSchema = z
  .object({
    result: z
      .object({
        data: z
          .object({
            heroes: z
              .array(
                z
                  .object({
                    id: z.number().int(),
                    name_english_loc: z.string().trim().max(200).optional(),
                    name_loc: z.string().trim().max(200).optional()
                  })
                  .passthrough()
              )
              .max(200)
              .optional(),
            // Valve leaves some names empty (37 items, 22.10.2026): such an item is skipped, not the whole list.
            itemabilities: z
              .array(
                z
                  .object({
                    id: z.number().int(),
                    name_english_loc: z.string().trim().max(200).optional(),
                    name_loc: z.string().trim().max(200).optional()
                  })
                  .passthrough()
              )
              .max(700)
              .optional()
          })
          .passthrough()
      })
      .passthrough()
  })
  .passthrough();

function parsePatchNameMaps(
  heroPayload: unknown,
  itemPayload: unknown
): { heroes: Map<number, string>; items: Map<number, string> } {
  const heroesParsed = patchNamesSchema.safeParse(heroPayload);
  const itemsParsed = patchNamesSchema.safeParse(itemPayload);
  if (
    !heroesParsed.success ||
    !itemsParsed.success ||
    heroesParsed.data.result.data.heroes === undefined ||
    itemsParsed.data.result.data.itemabilities === undefined
  ) {
    throw new DotaWatchError('DOTA_SOURCE_SHAPE', 'patch_notes');
  }
  return {
    heroes: new Map(
      heroesParsed.data.result.data.heroes.map((entry) => [
        entry.id,
        cleanPatchLabel(entry.name_english_loc || entry.name_loc)
      ])
    ),
    items: new Map(
      itemsParsed.data.result.data.itemabilities.map((entry) => [
        entry.id,
        cleanPatchLabel(entry.name_english_loc || entry.name_loc)
      ])
    )
  };
}

export interface DotaPatchChangeTheme {
  category: string;
  name: string;
  changes: string[];
  noteCount: number;
  numericNoteCount: number;
  structuralNoteCount: number;
  relativeMagnitudeScore: number;
}

export interface DotaPatchSummary {
  patchNumber: string;
  title: string;
  themes: DotaPatchChangeTheme[];
}

export interface DotaPatchAnalysis {
  status: 'complete' | 'incomplete' | 'no_recognized_facts';
  facts: DotaPatchFactDto[];
  unknownNoteCount: number;
  unresolvedEntityCount: number;
  truncatedFactCount: number;
}

export interface DotaPatchInspection {
  summary: DotaPatchSummary | null;
  analysis: DotaPatchAnalysis;
}

/**
 * The patch's notes grouped for its post (owner, 22.10.2026): general notes, heroes and items by name, every note as
 * Valve wrote it. Null when Valve has no notes for the version (yet).
 */
export async function digestOfficialPatch(fetcher: DotaSourceFetcher, version: string): Promise<PatchDigest | null> {
  const response = await fetcher.fetchPatchDetails(version);
  const parsed = patchDetailsSchema.safeParse(await readBoundedJson(response, MAX_PATCH_BYTES, 'patch_notes'));
  if (!parsed.success || parsed.data.patch_number.toLowerCase() !== version) return null;
  const names = await fetcher.fetchPatchNameMaps();
  const texts = (notes: { note: string }[] | undefined) =>
    (notes ?? []).map((entry) => entry.note.trim()).filter(Boolean);
  const entities = (
    entries: z.infer<typeof patchEntityNotesSchema>[] | undefined,
    byId: Map<number, string>,
    key: 'hero_id' | 'ability_id'
  ) =>
    (entries ?? []).flatMap((entry): PatchEntityNotes[] => {
      const id = entry[key];
      const name = cleanPatchLabel(id === undefined ? entry.title : byId.get(id));
      const notes = [
        ...texts(entry.hero_notes),
        ...texts(entry.ability_notes),
        ...texts(entry.talent_notes),
        ...(entry.abilities ?? []).flatMap((ability) => texts(ability.ability_notes))
      ];
      return name === '' || notes.length === 0 ? [] : [{ name, notes }];
    });
  const digest: PatchDigest = {
    version,
    general: (parsed.data.general_notes ?? [])
      .map((group) => ({ title: cleanPatchLabel(group.title), notes: texts(group.generic) }))
      .filter((group) => group.notes.length > 0),
    heroes: entities(parsed.data.heroes, names.heroes, 'hero_id'),
    items: entities(parsed.data.items, names.items, 'ability_id'),
    neutralItems: entities(parsed.data.neutral_items, names.items, 'ability_id'),
    noteCount: 0,
    talentNotes: (parsed.data.heroes ?? []).reduce((sum, hero) => sum + texts(hero.talent_notes).length, 0)
  };
  digest.noteCount =
    digest.general.reduce((sum, group) => sum + group.notes.length, 0) +
    [...digest.heroes, ...digest.items, ...digest.neutralItems].reduce((sum, entity) => sum + entity.notes.length, 0);
  return digest;
}

/** The newest version in Valve's patch list: a hotfix belongs to it (its own title has only a date). */
export async function latestPatchVersion(fetcher: DotaSourceFetcher): Promise<string | null> {
  const items = parsePatchList(
    await readBoundedJson(await fetcher.fetch('patch_notes'), MAX_PATCH_BYTES, 'patch_notes')
  );
  return (
    items.reduce<DotaUpdateItem | null>(
      (last, item) => (last === null || item.publishedAt > last.publishedAt ? item : last),
      null
    )?.externalId ?? null
  );
}

export async function inspectOfficialPatch(fetcher: DotaSourceFetcher, version: string): Promise<DotaPatchInspection> {
  let response: Response;
  try {
    response = await fetcher.fetchPatchDetails(version);
  } catch {
    throw new DotaPatchDetailError('DOTA_PATCH_DETAIL_FETCH', version);
  }
  let payload: unknown;
  try {
    payload = await readBoundedJson(response, MAX_PATCH_BYTES, 'patch_notes');
  } catch (error) {
    if (!(error instanceof DotaWatchError)) throw error;
    throw new DotaPatchDetailError(
      error.code.replace('DOTA_SOURCE_', 'DOTA_PATCH_DETAIL_') as DotaPatchDetailError['code'],
      version
    );
  }
  const parsed = patchDetailsSchema.safeParse(payload);
  if (!parsed.success || parsed.data.patch_number !== version)
    throw new DotaPatchDetailError('DOTA_PATCH_DETAIL_SHAPE', version);

  let nameMaps: { heroes: Map<number, string>; items: Map<number, string> };
  try {
    nameMaps = await fetcher.fetchPatchNameMaps();
  } catch (error) {
    const code = error instanceof DotaWatchError ? error.code : 'DOTA_SOURCE_FETCH';
    throw new DotaPatchDetailError(
      code.replace('DOTA_SOURCE_', 'DOTA_PATCH_DETAIL_') as DotaPatchDetailError['code'],
      version
    );
  }

  const countNotes = (notes: { note: string }[] | undefined) =>
    (notes ?? []).filter((entry) => entry.note.trim() !== '').length;
  const makeTheme = (
    category: string,
    name: string,
    notes: { note: string }[] | undefined
  ): DotaPatchChangeTheme | null => {
    const texts = (notes ?? []).map((entry) => entry.note.trim()).filter(Boolean);
    if (texts.length === 0) return null;
    const changes = texts.map(summarizePatchNote).filter((change): change is string => change !== null);
    return {
      category,
      name,
      changes,
      noteCount: texts.length,
      numericNoteCount: changes.filter((change) => /\d/.test(change)).length,
      structuralNoteCount: changes.filter((change) => change.startsWith('Добавлено:')).length,
      relativeMagnitudeScore: texts.reduce((maximum, note) => Math.max(maximum, relativeMagnitudeScore(note)), 0)
    };
  };
  const themes: DotaPatchChangeTheme[] = [];
  let unresolvedEntities = false;
  for (const group of parsed.data.general_notes ?? []) {
    const theme = makeTheme(
      'Общие изменения',
      cleanPatchLabel(group.title) || 'Общие игровые изменения',
      group.generic
    );
    if (theme !== null) themes.push(theme);
  }
  for (const hero of parsed.data.heroes ?? []) {
    const notes = [
      ...(hero.hero_notes ?? []),
      ...(hero.talent_notes ?? []),
      ...(hero.abilities ?? []).flatMap((ability) => ability.ability_notes ?? [])
    ];
    if (countNotes(notes) === 0) continue;
    const name = cleanPatchLabel(hero.hero_id === undefined ? undefined : nameMaps.heroes.get(hero.hero_id));
    if (name === '') {
      unresolvedEntities = true;
      continue;
    }
    const theme = makeTheme('Герой', name, notes);
    if (theme !== null) themes.push(theme);
  }
  const collectItems = (entries: z.infer<typeof patchEntityNotesSchema>[], category: string) => {
    for (const entry of entries) {
      if (entry.ability_id === undefined || entry.ability_id === -1 || entry.is_general_note === true) continue;
      if (countNotes(entry.ability_notes) === 0) continue;
      const name = cleanPatchLabel(nameMaps.items.get(entry.ability_id));
      if (name === '') {
        unresolvedEntities = true;
        continue;
      }
      const theme = makeTheme(category, name, entry.ability_notes);
      if (theme !== null) themes.push(theme);
    }
  };
  collectItems(parsed.data.items ?? [], 'Предмет');
  collectItems(parsed.data.neutral_items ?? [], 'Нейтральный предмет');
  for (const creep of parsed.data.neutral_creeps ?? []) {
    const name = cleanPatchLabel(creep.localized_name) || cleanPatchLabel(creep.name);
    if (countNotes(creep.neutral_creep_notes) === 0) continue;
    if (name === '') {
      unresolvedEntities = true;
      continue;
    }
    const theme = makeTheme('Нейтральное существо', name, creep.neutral_creep_notes);
    if (theme !== null) themes.push(theme);
  }
  themes.sort(
    (left, right) =>
      patchThemeScore(right) - patchThemeScore(left) ||
      left.category.localeCompare(right.category) ||
      left.name.localeCompare(right.name)
  );
  const rankedThemes = selectPatchThemes(themes);
  const summary =
    rankedThemes.length === 0 || unresolvedEntities
      ? null
      : { patchNumber: parsed.data.patch_number, title: parsed.data.patch_name, themes: rankedThemes };
  return {
    summary,
    analysis: parseOfficialPatchFacts(payload, version, nameMaps)
  };
}

export async function summarizeOfficialPatch(
  fetcher: DotaSourceFetcher,
  version: string
): Promise<DotaPatchSummary | null> {
  return (await inspectOfficialPatch(fetcher, version)).summary;
}

function parseOfficialPatchFacts(
  payload: unknown,
  version: string,
  nameMaps: { heroes: Map<number, string>; items: Map<number, string> }
): DotaPatchAnalysis {
  const parsed = patchDetailsSchema.safeParse(payload);
  if (!parsed.success || parsed.data.patch_number !== version)
    throw new DotaPatchDetailError('DOTA_PATCH_DETAIL_SHAPE', version);

  const facts: DotaPatchFactDto[] = [];
  let unknownNoteCount = 0;
  let unresolvedEntityCount = 0;
  let truncatedFactCount = 0;
  const appendNotes = (
    entityType: DotaPatchFactDto['entityType'],
    entityName: string,
    section: DotaPatchFactDto['section'],
    entityIndex: number,
    groupIndex: number,
    notes: { note: string }[] | undefined
  ) => {
    for (const [noteIndex, entry] of (notes ?? []).entries()) {
      const extracted = extractPatchFact(entry.note);
      if (extracted === null) {
        unknownNoteCount += 1;
        continue;
      }
      if (facts.length >= 500) {
        truncatedFactCount += 1;
        continue;
      }
      facts.push({
        id: `patch:${version}:${entityType}:${entityIndex}:${section}:${groupIndex}:${noteIndex}`,
        entityType,
        entityName,
        section,
        change: extracted.change,
        ...(extracted.direction === undefined ? {} : { direction: extracted.direction }),
        ...(extracted.before === undefined ? {} : { before: extracted.before }),
        ...(extracted.after === undefined ? {} : { after: extracted.after })
      });
    }
  };
  const appendNamedEntity = (
    entityType: DotaPatchFactDto['entityType'],
    section: DotaPatchFactDto['section'],
    entityIndex: number,
    notes: { note: string }[] | undefined,
    lookupName: string
  ) => {
    if ((notes ?? []).length === 0) return;
    const entityName = cleanPatchLabel(lookupName);
    if (entityName === '') {
      unresolvedEntityCount += 1;
      for (const entry of notes ?? []) if (extractPatchFact(entry.note) === null) unknownNoteCount += 1;
      return;
    }
    appendNotes(entityType, entityName, section, entityIndex, 0, notes);
  };

  for (const [groupIndex, group] of (parsed.data.general_notes ?? []).entries()) {
    const notes = group.generic;
    appendNotes('general', cleanPatchLabel(group.title) || 'General gameplay changes', 'general', groupIndex, 0, notes);
  }
  for (const [heroIndex, hero] of (parsed.data.heroes ?? []).entries()) {
    const heroName = cleanPatchLabel(hero.hero_id === undefined ? undefined : nameMaps.heroes.get(hero.hero_id));
    const sections: {
      section: DotaPatchFactDto['section'];
      notes: { note: string }[] | undefined;
      groupIndex: number;
    }[] = [
      { section: 'hero', notes: hero.hero_notes, groupIndex: 0 },
      { section: 'talent', notes: hero.talent_notes, groupIndex: 0 }
    ];
    for (const [abilityIndex, ability] of (hero.abilities ?? []).entries())
      sections.push({ section: 'ability', notes: ability.ability_notes, groupIndex: abilityIndex + 1 });
    for (const section of sections) {
      if ((section.notes ?? []).length === 0) continue;
      if (heroName === '') {
        unresolvedEntityCount += 1;
        for (const entry of section.notes ?? []) if (extractPatchFact(entry.note) === null) unknownNoteCount += 1;
      } else {
        appendNotes('hero', heroName, section.section, heroIndex, section.groupIndex, section.notes);
      }
    }
  }
  const appendItems = (
    entries: z.infer<typeof patchEntityNotesSchema>[],
    entityType: 'item' | 'neutral_item',
    section: 'item' | 'neutral_item'
  ) => {
    for (const [entityIndex, entry] of entries.entries()) {
      if (entry.ability_id === undefined || entry.ability_id === -1 || entry.is_general_note === true) continue;
      appendNamedEntity(
        entityType,
        section,
        entityIndex,
        entry.ability_notes,
        nameMaps.items.get(entry.ability_id) ?? ''
      );
    }
  };
  appendItems(parsed.data.items ?? [], 'item', 'item');
  appendItems(parsed.data.neutral_items ?? [], 'neutral_item', 'neutral_item');
  for (const [entityIndex, creep] of (parsed.data.neutral_creeps ?? []).entries()) {
    appendNamedEntity(
      'neutral_creep',
      'neutral_creep',
      entityIndex,
      creep.neutral_creep_notes,
      cleanPatchLabel(creep.localized_name) || cleanPatchLabel(creep.name)
    );
  }

  // The contract caps the response at 500 facts. Omitted facts make the stored analysis explicitly partial.
  const status =
    unknownNoteCount > 0 || unresolvedEntityCount > 0 || truncatedFactCount > 0
      ? 'incomplete'
      : facts.length === 0
        ? 'no_recognized_facts'
        : 'complete';
  return { status, facts, unknownNoteCount, unresolvedEntityCount, truncatedFactCount };
}

function extractPatchFact(note: string): {
  change: string;
  direction?: DotaPatchFactDto['direction'];
  before?: string;
  after?: string;
} | null {
  const change = summarizePatchNote(note);
  if (change === null || change.length > 500) return null;
  if (/^new map mechanic\.?$/i.test(note.trim())) return { change, direction: 'added' };
  const parameterPattern = Object.keys(patchParameterNames)
    .sort((left, right) => right.length - left.length)
    .map((parameter) => parameter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  const fromTo = note.match(
    new RegExp(
      `\\b(${parameterPattern})\\s+(?:was\\s+)?(increased|decreased|reduced|lowered|raised|changed)\\s+from\\s+(-?\\d+(?:\\.\\d+)?%?)\\s+to\\s+(-?\\d+(?:\\.\\d+)?%?)`,
      'i'
    )
  );
  if (fromTo === null) return { change };
  const before = fromTo[3] as string;
  const after = fromTo[4] as string;
  if (before.length > 40 || after.length > 40) return null;
  const beforeValue = Number(before.replace('%', ''));
  const afterValue = Number(after.replace('%', ''));
  const direction: DotaPatchFactDto['direction'] =
    afterValue > beforeValue ? 'increase' : afterValue < beforeValue ? 'decrease' : 'change';
  return { change, direction, before, after };
}

const patchParameterNames: Record<string, string> = {
  'attack range': 'Дальность атаки',
  'attack speed': 'Скорость атаки',
  armor: 'Броня',
  'base damage': 'Базовый урон',
  'cast range': 'Дальность применения',
  'cast time': 'Время применения',
  cooldown: 'Перезарядка',
  cost: 'Стоимость',
  damage: 'Урон',
  duration: 'Длительность',
  health: 'Здоровье',
  lifesteal: 'Вампиризм',
  'mana cost': 'Расход маны',
  'mana regeneration': 'Восстановление маны',
  'movement speed': 'Скорость передвижения',
  range: 'Дальность',
  'respawn time': 'Время возрождения',
  vampirism: 'Вампиризм'
};

function summarizePatchNote(note: string): string | null {
  if (/^new map mechanic\.?$/i.test(note.trim())) return 'Добавлено: новая механика карты';
  const parameter = Object.keys(patchParameterNames)
    .sort((left, right) => right.length - left.length)
    .join('|');
  const fromTo = note.match(
    new RegExp(
      `\\b(${parameter})\\s+(?:was\\s+)?(?:increased|decreased|reduced|lowered|raised|changed)\\s+from\\s+(-?\\d+(?:\\.\\d+)?%?)\\s+to\\s+(-?\\d+(?:\\.\\d+)?%?)`,
      'i'
    )
  );
  if (fromTo !== null) {
    const label = patchParameterNames[(fromTo[1] as string).toLowerCase()];
    return `${label}: ${fromTo[2]} → ${fromTo[3]}`;
  }
  const byAmount = note.match(
    new RegExp(
      `\\b(${parameter})\\s+(?:was\\s+)?(increased|decreased|reduced|lowered|raised)\\s+by\\s+(-?\\d+(?:\\.\\d+)?%?)`,
      'i'
    )
  );
  if (byAmount !== null) {
    const label = patchParameterNames[(byAmount[1] as string).toLowerCase()];
    const sign = /^(?:decreased|reduced|lowered)$/i.test(byAmount[2] as string) ? '−' : '+';
    return `${label}: ${sign}${byAmount[3]}`;
  }
  return null;
}

function patchThemeScore(theme: DotaPatchChangeTheme): number {
  return (
    theme.structuralNoteCount * 1_000_000 +
    theme.relativeMagnitudeScore * 10 +
    theme.numericNoteCount * 100 +
    Math.min(theme.noteCount, 9)
  );
}

function relativeMagnitudeScore(note: string): number {
  const match = note.match(/\bfrom\s+(-?\d+(?:\.\d+)?)\s*(%?)\s+to\s+(-?\d+(?:\.\d+)?)\s*(%?)/i);
  if (match === null || match[2] !== match[4]) return 0;
  const before = Number(match[1]);
  const after = Number(match[3]);
  if (!Number.isFinite(before) || !Number.isFinite(after) || before === 0) return 0;
  const ratioScore = Math.min(10_000, Math.round((Math.abs(after - before) / Math.abs(before)) * 10_000));
  if (/\b(gold|cost|price|recipe|shop)\b/i.test(note)) return Math.round(ratioScore / 10);
  if (
    /\b(damage|lifesteal|vampirism|cooldown|range|duration|armor|health|mana|attack speed|movement speed|cast time)\b/i.test(
      note
    )
  ) {
    return ratioScore;
  }
  return Math.round(ratioScore / 4);
}

function selectPatchThemes(themes: DotaPatchChangeTheme[]): DotaPatchChangeTheme[] {
  const eligible = themes
    .filter((theme) => theme.changes.length > 0)
    .sort(
      (left, right) =>
        patchThemeScore(right) - patchThemeScore(left) ||
        left.category.localeCompare(right.category) ||
        left.name.localeCompare(right.name)
    );
  if (eligible.length === 0) return [];
  const selected: DotaPatchChangeTheme[] = [];
  const topScore = patchThemeScore(eligible[0] as DotaPatchChangeTheme);
  const minBalancedScore = Math.ceil(topScore / 4);
  for (const theme of eligible) {
    if (selected.length === 4) break;
    if (selected.some((entry) => entry.category === theme.category)) continue;
    if (patchThemeScore(theme) >= minBalancedScore) selected.push(theme);
  }
  for (const theme of eligible) {
    if (selected.length === 4) break;
    if (!selected.some((entry) => entry.name === theme.name && entry.category === theme.category)) selected.push(theme);
  }
  return selected.sort(
    (left, right) =>
      patchThemeScore(right) - patchThemeScore(left) ||
      left.category.localeCompare(right.category) ||
      left.name.localeCompare(right.name)
  );
}

function cleanPatchLabel(value: string | undefined): string {
  return (value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

export interface DotaUpdateItem {
  sourceKey: DotaSourceKey;
  externalId: string;
  title: string;
  sourceUrl: string;
  publishedAt: number;
  /** Cleaned start of a Steam announcement; absent for patch notes. */
  excerpt?: string | null;
}

export interface DotaWatcherRepository {
  storeSync(input: { items: DotaUpdateItem[]; detectedAt: number }): Promise<{ inserted: number }>;
  recordSourceAttempt(input: { sourceKey: DotaSourceKey; attemptedAt: number }): Promise<void>;
  storeSourceSync(input: {
    sourceKey: DotaSourceKey;
    items: DotaUpdateItem[];
    detectedAt: number;
  }): Promise<{ inserted: number }>;
  listIntelligence(input: {
    source?: ContractDotaSourceKey;
    limit: number;
    now: number;
  }): Promise<Omit<DotaIntelligenceDto, 'watches'>>;
  getUpdateDetail(input: { sourceKey: DotaSourceKey; externalId: string }): Promise<DotaEventDetailDto | null>;
  savePatchAnalysis(input: {
    externalId: string;
    claimToken?: string;
    parseStatus: Extract<
      DotaEventDetailDto['parseStatus'],
      'pending' | 'complete' | 'incomplete' | 'no_recognized_facts' | 'unavailable'
    >;
    facts: DotaPatchFactDto[];
    parsedAt?: number;
  }): Promise<boolean>;
  claimPendingPatchAnalyses(input: {
    claimToken: string;
    now: number;
    leaseUntil: number;
    limit: number;
  }): Promise<string[]>;
  recordSourceFailure(input: {
    sourceKey: DotaSourceKey;
    code: DotaWatchError['code'] | DotaPatchDetailError['code'];
    externalId?: string;
    /** Feed-level diagnostics (shown in «Состояние лент»); patch-detail failures leave them alone. */
    httpStatus?: number | null;
    detail?: string;
    detectedAt: number;
    id: string;
  }): Promise<string>;
  /** A failure that is not the feed's fault (D1 write): diagnostics only, no incident and no owner alert. */
  recordSourceStoreFailure(input: { sourceKey: DotaSourceKey; detail: string; detectedAt: number }): Promise<void>;
  resolvePatchDetailFailures(input: { externalId: string; detectedAt: number }): Promise<void>;
  listDraftWork(limit: number): Promise<DotaDraftSource[]>;
  reserveDraft(input: { sourceKey: DotaSourceKey; externalId: string; postId: string }): Promise<string | null>;
  listOwnerAlertWork(limit: number): Promise<DotaDraftSource[]>;
  /** Steam announcements detected as events with no AI draft requested yet, oldest first. */
  listAiDraftWork(limit: number): Promise<DotaDraftSource[]>;
  /**
   * Claims the AI draft of a Steam announcement once per detection. `replay` is the owner asking again for any
   * announcement, a past one included: it becomes an event and takes the new job.
   */
  claimAiDraft(input: { externalId: string; jobId: string; replay: boolean; now: number }): Promise<boolean>;
  /** The job ended, whatever its result: the event is no longer «writing». */
  finishAiDraft(input: { externalId: string; jobId: string }): Promise<void>;
  /** The queue refused the job: the claim is given back, so the next tick asks again. */
  releaseAiDraft(input: { externalId: string; jobId: string }): Promise<void>;
  /** The model wrote the job's draft; ignored when a later replay took the event. */
  setAiGeneration(input: { externalId: string; jobId: string; generationId: string }): Promise<void>;
  /**
   * The owner approved a draft of the event (`generationIds`: the draft and its ancestors): its post becomes the
   * event's draft, with the notice counted as sent (the approval reply has the publish buttons). It replaces an
   * earlier draft that has no publication. The linked announcement's id, null when nothing was linked.
   */
  linkAiPost(input: { generationIds: readonly string[]; postId: string; now: number }): Promise<string | null>;
  findSteamAnnouncement(externalId: string): Promise<DotaDraftSource | null>;
  claimDraftOwnerAlert(input: { sourceKey: DotaSourceKey; externalId: string; claimedAt: number }): Promise<boolean>;
  listSourceIncidentAlerts(limit: number): Promise<DotaSourceIncident[]>;
  claimSourceIncidentAlert(input: { id: string; claimedAt: number }): Promise<{ resolvedAt: number | null } | null>;
}

export interface DotaDraftSource extends DotaUpdateItem {
  isBaseline: boolean;
  draftPostId: string | null;
  excerpt: string | null;
  eventType: SourceEventType;
}

export interface DotaSourceIncident {
  id: string;
  sourceKey: DotaSourceKey;
  externalId: string | null;
  code: DotaWatchError['code'] | DotaPatchDetailError['code'];
  resolvedAt: number | null;
}

const DOTA_DRAFT_WORK_SQL = `
  SELECT u.source_key, u.external_id, u.title, u.source_url, u.published_at, u.is_baseline, u.draft_post_id, u.excerpt, u.event_type
  FROM dota_update_items u INDEXED BY dota_draft_candidates_idx
  WHERE u.is_baseline = 0 AND u.draft_post_id IS NULL AND u.hidden_at IS NULL AND u.source_key = 'patch_notes'
  ORDER BY u.published_at, u.source_key, u.external_id LIMIT ?1`;

// A Steam announcement is drafted by the AI writer in the owner's chat, not by a template (owner, 21.10.2026).
const DOTA_AI_DRAFT_WORK_SQL = `
  SELECT u.source_key, u.external_id, u.title, u.source_url, u.published_at, u.is_baseline, u.draft_post_id, u.excerpt, u.event_type
  FROM dota_update_items u INDEXED BY dota_draft_candidates_idx
  WHERE u.is_baseline = 0 AND u.draft_post_id IS NULL AND u.hidden_at IS NULL AND u.source_key = 'steam_news'
    AND u.ai_job_id IS NULL
  ORDER BY u.published_at, u.source_key, u.external_id LIMIT ?1`;

/** How long a requested AI draft locks its event; a lost job frees it after this (the read model shows the same). */
const AI_WRITING_MS = 15 * 60_000;

const STEAM_ANNOUNCEMENT_COLUMNS = `u.source_key, u.external_id, u.title, u.source_url, u.published_at, u.is_baseline,
  u.draft_post_id, u.excerpt, u.event_type`;

const DOTA_PENDING_PATCH_ANALYSIS_SQL = `
  WITH candidates AS (
    SELECT external_id FROM dota_patch_analyses
    WHERE parse_status IN ('pending', 'unavailable') AND (claim_until IS NULL OR claim_until <= ?2)
    ORDER BY parsed_at, external_id LIMIT ?3
  )
  UPDATE dota_patch_analyses SET claim_token = ?1, claim_until = ?4
  WHERE source_key = 'patch_notes' AND parse_status IN ('pending', 'unavailable')
    AND (claim_until IS NULL OR claim_until <= ?2)
    AND external_id IN (SELECT external_id FROM candidates)`;

const DOTA_DRAFT_RECOVERY_SQL = `
  SELECT u.source_key, u.external_id, u.title, u.source_url, u.published_at, u.is_baseline, u.draft_post_id, u.excerpt, u.event_type
  FROM dota_update_items u INDEXED BY dota_draft_recovery_idx LEFT JOIN posts p ON p.id = u.draft_post_id
  WHERE u.is_baseline = 0 AND u.draft_post_id IS NOT NULL AND u.owner_alert_claimed_at IS NULL AND p.id IS NULL
    AND u.hidden_at IS NULL
  ORDER BY u.published_at, u.source_key, u.external_id LIMIT ?1`;

const DOTA_OWNER_ALERT_WORK_SQL = `
  SELECT u.source_key, u.external_id, u.title, u.source_url, u.published_at, u.is_baseline, u.draft_post_id, u.excerpt, u.event_type
  FROM dota_update_items u INDEXED BY dota_draft_recovery_idx JOIN posts p ON p.id = u.draft_post_id AND p.deleted_at IS NULL
  WHERE u.is_baseline = 0 AND u.draft_post_id IS NOT NULL AND u.owner_alert_claimed_at IS NULL AND u.hidden_at IS NULL
  ORDER BY u.published_at, u.source_key, u.external_id LIMIT ?1`;

// Replays of one tick (same `detectedAt`) must not count a failure twice.
const RECORD_FEED_ERROR_SQL = `UPDATE dota_source_state SET last_error_code = ?2, last_error_http_status = ?3,
    last_error_detail = ?4, last_error_at = ?5, consecutive_failures = consecutive_failures + 1
  WHERE source_key = ?1 AND COALESCE(last_error_at, -1) < ?5`;

const DOTA_SOURCE_INCIDENT_ALERT_SQL = `
  SELECT id, source_key, external_id, code, resolved_at FROM dota_source_incidents INDEXED BY dota_source_incidents_alert_idx
  WHERE owner_alert_claimed_at IS NULL
  ORDER BY created_at, id LIMIT ?1`;

async function readBoundedJson(response: Response, maximumBytes: number, sourceKey: DotaSourceKey): Promise<unknown> {
  // Redirects are not followed (`redirect: 'manual'`): a 3xx lands here as a non-ok response.
  if (!response.ok) {
    await response.body?.cancel();
    throw new DotaWatchError('DOTA_SOURCE_HTTP', sourceKey, response.status, describeHttp(response));
  }
  if (response.body === null) throw new DotaWatchError('DOTA_SOURCE_JSON', sourceKey, null, 'Empty response body');

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel();
        throw new DotaWatchError(
          'DOTA_SOURCE_BODY_LIMIT',
          sourceKey,
          null,
          `Response is larger than the ${maximumBytes} byte limit (read ${total} bytes)`
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch (error) {
    throw new DotaWatchError('DOTA_SOURCE_JSON', sourceKey, null, describeError(error));
  }
}

// The whole announcement for the AI writer and the side panel: the feed keeps only Steam's first 500 characters.
// Steam has no lookup by id, so this asks for the few announcements up to the event's own time and picks it by gid.
const STEAM_ANNOUNCEMENT_TEXT_MAX = 20_000;
const MAX_STEAM_ANNOUNCEMENT_BYTES = 512 * 1024;
const MAX_ANNOUNCEMENT_IMAGES = 10;
// Image macros of an announcement body, e.g. `{STEAM_CLAN_LOC_IMAGE}/3703047/<sha1>.png`, served by Steam's CDN.
const STEAM_CLAN_IMAGE = /\{STEAM_CLAN_(?:LOC_)?IMAGE\}\/(\d{1,12}\/[0-9a-f]{40}\.(?:png|jpe?g|gif|webp))/gi;
const steamAnnouncementSchema = z.object({
  appnews: z.object({
    newsitems: z.array(z.object({ gid: z.string().max(100), contents: z.string().max(200_000) })).max(10)
  })
});

export interface SteamAnnouncement {
  /** Plain text, links and markup dropped, at most 20 000 characters. */
  text: string | null;
  /** Its own images on Steam's CDN, in order, at most 10. */
  images: string[];
  /** The event pages on dota2.com it links to (`eventPageSlugs`). */
  pages: string[];
}

/** One Steam announcement; null when Steam no longer returns it. */
export async function fetchSteamAnnouncement(
  input: { externalId: string; publishedAt: number },
  fetchImpl: typeof fetch = fetch
): Promise<SteamAnnouncement | null> {
  const url = new URL('https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/');
  url.searchParams.set('appid', '570');
  url.searchParams.set('count', '5');
  url.searchParams.set('maxlength', '0');
  url.searchParams.set('feeds', 'steam_community_announcements');
  url.searchParams.set('enddate', String(Math.floor(input.publishedAt / 1_000)));
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: 'manual'
    });
  } catch (error) {
    throw new DotaWatchError('DOTA_SOURCE_FETCH', 'steam_news', null, describeError(error));
  }
  const parsed = steamAnnouncementSchema.safeParse(
    await readBoundedJson(response, MAX_STEAM_ANNOUNCEMENT_BYTES, 'steam_news')
  );
  if (!parsed.success) throw new DotaWatchError('DOTA_SOURCE_SHAPE', 'steam_news', null, describeShape(parsed.error));
  const item = parsed.data.appnews.newsitems.find((news) => news.gid === input.externalId);
  if (item === undefined) return null;
  const images = [
    ...new Set(
      Array.from(
        item.contents.matchAll(STEAM_CLAN_IMAGE),
        (match) => `https://clan.akamai.steamstatic.com/images/${match[1]}`
      )
    )
  ].slice(0, MAX_ANNOUNCEMENT_IMAGES);
  return {
    text: cleanExcerpt(item.contents, STEAM_ANNOUNCEMENT_TEXT_MAX, true),
    images,
    pages: eventPageSlugs(item.contents)
  };
}

// dota2.com shows the same announcement under the Steam event's own id, not the news feed's gid; Steam's events
// list (the one dota2.com reads) has both that id and the post time, equal to the feed's to the second.
const STEAM_EVENTS_URL =
  'https://store.steampowered.com/events/ajaxgetpartnereventspageable/?clan_accountid=0&appid=570&offset=0&count=40&l=english';
const MAX_STEAM_EVENTS_BYTES = 1024 * 1024;
const steamEventsSchema = z.object({
  events: z
    .array(
      z.object({
        gid: z.string().regex(/^\d{1,25}$/),
        announcement_body: z.object({ posttime: z.number().int().nonnegative() }).nullable().optional()
      })
    )
    .max(100)
});

/** The announcement's page on dota2.com; null when it is not among Steam's 40 latest events. */
export async function findDotaNewsEntryUrl(
  input: { publishedAt: number },
  fetchImpl: typeof fetch = fetch
): Promise<string | null> {
  let response: Response;
  try {
    response = await fetchImpl(STEAM_EVENTS_URL, {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: 'manual'
    });
  } catch (error) {
    throw new DotaWatchError('DOTA_SOURCE_FETCH', 'steam_news', null, describeError(error));
  }
  const parsed = steamEventsSchema.safeParse(await readBoundedJson(response, MAX_STEAM_EVENTS_BYTES, 'steam_news'));
  if (!parsed.success) throw new DotaWatchError('DOTA_SOURCE_SHAPE', 'steam_news', null, describeShape(parsed.error));
  const postTime = Math.floor(input.publishedAt / 1_000);
  const event = parsed.data.events.find((item) => item.announcement_body?.posttime === postTime);
  return event === undefined ? null : `https://www.dota2.com/newsentry/${event.gid}`;
}

function parseSteamNews(payload: unknown): DotaUpdateItem[] {
  const parsed = steamNewsSchema.safeParse(payload);
  if (!parsed.success) throw new DotaWatchError('DOTA_SOURCE_SHAPE', 'steam_news', null, describeShape(parsed.error));
  const official: DotaUpdateItem[] = [];
  for (const news of parsed.data.appnews.newsitems) {
    if (news.feedname !== 'steam_community_announcements') continue;
    const url = new URL(news.url);
    const allowedHost = url.hostname === 'store.steampowered.com' || url.hostname === 'steamstore-a.akamaihd.net';
    const officialPath =
      url.pathname === `/news/app/570/view/${news.gid}` ||
      url.pathname === `/news/externalpost/steam_community_announcements/${news.gid}`;
    if (!['http:', 'https:'].includes(url.protocol) || !allowedHost || !officialPath) {
      throw new DotaWatchError(
        'DOTA_SOURCE_SHAPE',
        'steam_news',
        null,
        clipDetail(`newsitems ${news.gid}: unexpected url ${url.origin}${url.pathname}`)
      );
    }
    official.push({
      sourceKey: 'steam_news',
      externalId: news.gid,
      title: news.title,
      sourceUrl: `https://store.steampowered.com/news/externalpost/steam_community_announcements/${encodeURIComponent(news.gid)}`,
      publishedAt: news.date * 1_000,
      excerpt: cleanExcerpt(news.contents)
    });
  }
  return official;
}

function parsePatchList(payload: unknown): DotaUpdateItem[] {
  const parsed = patchListSchema.safeParse(payload);
  if (!parsed.success) throw new DotaWatchError('DOTA_SOURCE_SHAPE', 'patch_notes', null, describeShape(parsed.error));
  return parsed.data.patches.map((patch) => ({
    sourceKey: 'patch_notes',
    externalId: patch.patch_number,
    title: `Dota ${patch.patch_name}`,
    sourceUrl: `https://www.dota2.com/patches/${encodeURIComponent(patch.patch_number)}`,
    publishedAt: patch.patch_timestamp * 1_000
  }));
}

function isSubrequestBudgetError(error: unknown): boolean {
  return error instanceof Error && /too many (api requests|subrequests)/i.test(error.message);
}

export async function syncDotaUpdates(input: {
  fetcher: DotaSourceFetcher;
  repo: DotaWatcherRepository;
  detectedAt: number;
}): Promise<{ inserted: number; fetched: number }> {
  const syncSource = async (sourceKey: DotaSourceKey): Promise<{ inserted: number; fetched: number }> => {
    let stage: 'store' | 'fetch' = 'store';
    try {
      await input.repo.recordSourceAttempt({ sourceKey, attemptedAt: input.detectedAt });
      stage = 'fetch';
      let response: Response;
      try {
        response = await input.fetcher.fetch(sourceKey);
      } catch (error) {
        throw new DotaWatchError('DOTA_SOURCE_FETCH', sourceKey, null, describeError(error));
      }
      const payload = await readBoundedJson(
        response,
        sourceKey === 'steam_news' ? MAX_STEAM_BYTES : MAX_PATCH_BYTES,
        sourceKey
      );
      const items = sourceKey === 'steam_news' ? parseSteamNews(payload) : parsePatchList(payload);
      stage = 'store';
      const stored = await input.repo.storeSourceSync({ sourceKey, items, detectedAt: input.detectedAt });
      return { inserted: stored.inserted, fetched: 1 };
    } catch (error) {
      if (error instanceof DotaWatchError) {
        await input.repo.recordSourceFailure({
          sourceKey,
          code: error.code,
          httpStatus: error.httpStatus,
          detail: error.detail,
          detectedAt: input.detectedAt,
          id: crypto.randomUUID()
        });
        return { inserted: 0, fetched: 0 };
      }
      // The invocation ran out of D1/subrequest allowance: the next tick retries, nothing is wrong with the feed.
      if (isSubrequestBudgetError(error)) return { inserted: 0, fetched: 0 };
      // Not a feed problem (D1 rejected a write, a bug in a mapper): reported as STORE, never as a fetch failure.
      await input.repo.recordSourceStoreFailure({
        sourceKey,
        detail: clipDetail(`${stage === 'store' ? 'D1/store' : 'unexpected'}: ${describeError(error)}`),
        detectedAt: input.detectedAt
      });
      return { inserted: 0, fetched: 0 };
    }
  };
  const results = await Promise.all(DOTA_SOURCE_KEYS.map(syncSource));
  return {
    inserted: results.reduce((total, result) => total + result.inserted, 0),
    fetched: results.reduce((total, result) => total + result.fetched, 0)
  };
}

export function createD1DotaWatcherRepository(db: D1Database): DotaWatcherRepository {
  return {
    async storeSync({ items, detectedAt }) {
      const stored = await Promise.all(
        DOTA_SOURCE_KEYS.map((sourceKey) =>
          this.storeSourceSync({ sourceKey, items: items.filter((item) => item.sourceKey === sourceKey), detectedAt })
        )
      );
      return { inserted: stored.reduce((sum, entry) => sum + entry.inserted, 0) };
    },

    async storeSourceSync({ sourceKey, items: fetched, detectedAt }) {
      // Feeds return their whole history (up to 100 news, 200 patches) every 5 minutes. Only items near the
      // newest stored one can be new; re-sending the rest cost ~1 row read each, every run.
      const newest = await db
        .prepare('SELECT MAX(published_at) AS newest FROM dota_update_items WHERE source_key = ?1')
        .bind(sourceKey)
        .first<{ newest: number | null }>();
      const from = newest?.newest == null ? null : newest.newest - RESYNC_WINDOW_MS;
      const items = from === null ? fetched : fetched.filter((item) => item.publishedAt >= from);
      const statements: D1PreparedStatement[] = [
        db
          .prepare('INSERT OR IGNORE INTO dota_source_state (source_key, baseline_seeded) VALUES (?1, 0)')
          .bind(sourceKey)
      ];
      const insertIndexes: number[] = [];
      const chunkSize = sourceKey === 'steam_news' ? STEAM_INSERT_CHUNK_SIZE : PATCH_INSERT_CHUNK_SIZE;
      for (let start = 0; start < items.length; start += chunkSize) {
        const chunk = items.slice(start, start + chunkSize);
        const sourceLiteral = sourceKey === 'steam_news' ? "'steam_news'" : "'patch_notes'";
        const values = chunk
          .map(
            () =>
              `(${sourceLiteral}, ?, ?, ?, ?, ?, (SELECT CASE WHEN baseline_seeded = 0 THEN 1 ELSE 0 END FROM dota_source_state WHERE source_key = ${sourceLiteral}), ${
                sourceKey === 'steam_news' ? '?, ?' : "NULL, 'patch'"
              })`
          )
          .join(', ');
        const bindings: (string | number | null)[] = [];
        for (const item of chunk) {
          bindings.push(item.externalId, item.title, item.sourceUrl, item.publishedAt, detectedAt);
          if (sourceKey === 'steam_news') {
            const excerpt = item.excerpt ?? null;
            bindings.push(excerpt, classifyDotaEvent({ sourceKey, title: item.title, excerpt }));
          }
        }
        insertIndexes.push(statements.length);
        statements.push(
          db
            .prepare(
              `INSERT OR IGNORE INTO dota_update_items (source_key, external_id, title, source_url, published_at, detected_at, is_baseline, excerpt, event_type) VALUES ${values}`
            )
            .bind(...bindings)
        );
        if (sourceKey === 'patch_notes') {
          statements.push(
            db
              .prepare(
                `INSERT OR IGNORE INTO dota_patch_analyses (source_key, external_id, parse_status, facts_json, parsed_at)
                 SELECT source_key, external_id, 'pending', '[]', detected_at
                 FROM dota_update_items WHERE source_key = 'patch_notes' AND external_id IN (${chunk.map(() => '?').join(', ')})`
              )
              .bind(...chunk.map((item) => item.externalId))
          );
        }
      }
      statements.push(
        db
          .prepare(
            `UPDATE dota_source_state SET baseline_seeded = 1, last_attempt_at = max(COALESCE(last_attempt_at, 0), ?2),
               last_success_at = max(COALESCE(last_success_at, 0), ?2),
               last_error_code = CASE WHEN COALESCE(last_error_at, -1) <= ?2 THEN NULL ELSE last_error_code END,
               last_error_http_status = CASE WHEN COALESCE(last_error_at, -1) <= ?2 THEN NULL ELSE last_error_http_status END,
               last_error_detail = CASE WHEN COALESCE(last_error_at, -1) <= ?2 THEN NULL ELSE last_error_detail END,
               consecutive_failures = CASE WHEN COALESCE(last_error_at, -1) <= ?2 THEN 0 ELSE consecutive_failures END,
               last_error_at = CASE WHEN COALESCE(last_error_at, -1) <= ?2 THEN NULL ELSE last_error_at END
             WHERE source_key = ?1`
          )
          .bind(sourceKey, detectedAt),
        db
          .prepare(
            'UPDATE dota_source_incidents SET resolved_at = max(created_at, ?1) WHERE source_key = ?2 AND resolved_at IS NULL AND external_id IS NULL'
          )
          .bind(detectedAt, sourceKey)
      );
      const results = await db.batch(statements);
      return { inserted: insertIndexes.reduce((sum, index) => sum + (results[index]?.meta.changes ?? 0), 0) };
    },

    async recordSourceAttempt({ sourceKey, attemptedAt }) {
      await db.batch([
        db
          .prepare('INSERT OR IGNORE INTO dota_source_state (source_key, baseline_seeded) VALUES (?1, 0)')
          .bind(sourceKey),
        db
          .prepare(
            'UPDATE dota_source_state SET last_attempt_at = max(COALESCE(last_attempt_at, 0), ?2) WHERE source_key = ?1'
          )
          .bind(sourceKey, attemptedAt)
      ]);
    },

    async listIntelligence({ source, limit, now }) {
      const stateResult = await db
        .prepare(
          `SELECT source_key, baseline_seeded, last_attempt_at, last_success_at, last_error_code,
                  last_error_http_status, last_error_detail, last_error_at, consecutive_failures
           FROM dota_source_state`
        )
        .all<{
          source_key: DotaSourceKey;
          baseline_seeded: number;
          last_attempt_at: number | null;
          last_success_at: number | null;
          last_error_code: string | null;
          last_error_http_status: number | null;
          last_error_detail: string | null;
          last_error_at: number | null;
          consecutive_failures: number;
        }>();
      const incidentResult = await db
        .prepare(
          `WITH source_keys(source_key) AS (VALUES ('steam_news'), ('patch_notes'))
           SELECT source_keys.source_key, incident.code, incident.created_at, incident.external_id,
             CASE WHEN EXISTS (
               SELECT 1 FROM dota_source_incidents source_incident
               WHERE source_incident.source_key = source_keys.source_key
                 AND source_incident.external_id IS NULL AND source_incident.resolved_at IS NULL
             ) THEN 1 ELSE 0 END AS has_source_incident
           FROM source_keys
           LEFT JOIN dota_source_incidents incident ON incident.id = (
             SELECT latest.id FROM dota_source_incidents latest INDEXED BY dota_source_incidents_open_newest_idx
             WHERE latest.source_key = source_keys.source_key AND latest.resolved_at IS NULL
             ORDER BY latest.created_at DESC, latest.id DESC LIMIT 1
           )`
        )
        .all<{
          source_key: DotaSourceKey;
          code: string | null;
          created_at: number | null;
          external_id: string | null;
          has_source_incident: number;
        }>();
      const itemSql =
        source === undefined
          ? `SELECT u.source_key, u.external_id, u.title, u.source_url, u.published_at, u.detected_at, u.is_baseline,
                  p.id AS linked_draft_id, p.title AS linked_draft_title
           FROM dota_update_items u LEFT JOIN posts p ON p.id = u.draft_post_id AND p.deleted_at IS NULL
           ORDER BY u.published_at DESC, u.source_key ASC, u.external_id ASC LIMIT ?1`
          : `SELECT u.source_key, u.external_id, u.title, u.source_url, u.published_at, u.detected_at, u.is_baseline,
                  p.id AS linked_draft_id, p.title AS linked_draft_title
           FROM dota_update_items u LEFT JOIN posts p ON p.id = u.draft_post_id AND p.deleted_at IS NULL
           WHERE u.source_key = ?1 ORDER BY u.published_at DESC, u.source_key ASC, u.external_id ASC LIMIT ?2`;
      const itemRows =
        source === undefined
          ? await db.prepare(itemSql).bind(limit).all<DotaIntelligenceRow>()
          : await db.prepare(itemSql).bind(source, limit).all<DotaIntelligenceRow>();
      const states = new Map(stateResult.results.map((row) => [row.source_key, row]));
      const incidents = new Map<DotaSourceKey, { code: string; created_at: number; external_id: string | null }>();
      const sourceIncidents = new Set<DotaSourceKey>();
      for (const incident of incidentResult.results) {
        if (incident.code !== null && incident.created_at !== null) {
          incidents.set(incident.source_key, {
            code: incident.code,
            created_at: incident.created_at,
            external_id: incident.external_id
          });
        }
        if (incident.has_source_incident === 1) sourceIncidents.add(incident.source_key);
      }
      const sources = DOTA_SOURCE_KEYS.map((key) => {
        const state = states.get(key);
        const incident = incidents.get(key);
        const lastAttemptAt = state?.last_attempt_at ?? null;
        const lastSuccessAt = state?.last_success_at ?? null;
        const baselineSeeded = state?.baseline_seeded === 1;
        const hasSourceIncident = sourceIncidents.has(key) || (state?.consecutive_failures ?? 0) > 0;
        const health: DotaIntelligenceDto['sources'][number]['health'] = hasSourceIncident
          ? 'degraded'
          : lastSuccessAt === null
            ? baselineSeeded
              ? 'stale'
              : 'unverified'
            : now - lastSuccessAt > 30 * 60_000
              ? 'stale'
              : 'healthy';
        return {
          key,
          name: key === 'steam_news' ? 'Steam Community announcements' : 'Official Dota 2 patch notes',
          officialUrl:
            key === 'steam_news'
              ? 'https://steamcommunity.com/games/dota2/announcements/'
              : 'https://www.dota2.com/patches',
          lastAttemptAt: lastAttemptAt === null ? null : new Date(lastAttemptAt).toISOString(),
          lastSuccessAt: lastSuccessAt === null ? null : new Date(lastSuccessAt).toISOString(),
          health,
          lastError:
            state?.last_error_code != null && state.last_error_at !== null
              ? {
                  code: state.last_error_code,
                  httpStatus: state.last_error_http_status,
                  detail: state.last_error_detail ?? '',
                  at: new Date(state.last_error_at).toISOString(),
                  consecutiveFailures: Math.max(1, state.consecutive_failures),
                  lastSuccessAt: lastSuccessAt === null ? null : new Date(lastSuccessAt).toISOString()
                }
              : null,
          ...(incident === undefined
            ? {}
            : {
                openIncident: {
                  code: incident.code,
                  occurredAt: new Date(incident.created_at).toISOString(),
                  ...(incident.external_id === null ? {} : { externalId: incident.external_id })
                }
              })
        };
      });
      const updates = itemRows.results.flatMap((row) => {
        if (!isOfficialStoredUrl(row.source_key, row.external_id, row.source_url)) return [];
        const linkedDraft =
          row.linked_draft_id !== null && row.linked_draft_title !== null
            ? { id: row.linked_draft_id, title: row.linked_draft_title }
            : undefined;
        return [
          {
            id: `${row.source_key}:${row.external_id}`,
            sourceKey: row.source_key,
            type: row.source_key === 'steam_news' ? ('news' as const) : ('patch' as const),
            title: row.title,
            sourceUrl: row.source_url,
            publishedAt: new Date(row.published_at).toISOString(),
            detectedAt: new Date(row.detected_at).toISOString(),
            isBaseline: row.is_baseline === 1,
            ...(linkedDraft === undefined ? {} : { linkedDraft })
          }
        ];
      });
      return { sources, updates };
    },

    async getUpdateDetail({ sourceKey, externalId }) {
      const row = await db
        .prepare(
          `SELECT u.source_key, u.external_id, u.title, u.source_url, u.published_at, u.detected_at,
                  u.is_baseline, p.id AS linked_draft_id, p.title AS linked_draft_title,
                  a.parse_status, a.facts_json
           FROM dota_update_items u
           LEFT JOIN posts p ON p.id = u.draft_post_id AND p.deleted_at IS NULL
           LEFT JOIN dota_patch_analyses a ON a.source_key = u.source_key AND a.external_id = u.external_id
           WHERE u.source_key = ?1 AND u.external_id = ?2`
        )
        .bind(sourceKey, externalId)
        .first<DotaDetailRow>();
      if (row === null || !isOfficialStoredUrl(row.source_key, row.external_id, row.source_url)) return null;
      const linkedDraft =
        row.linked_draft_id !== null && row.linked_draft_title !== null
          ? { id: row.linked_draft_id, title: row.linked_draft_title }
          : undefined;
      const update = {
        id: `${row.source_key}:${row.external_id}`,
        sourceKey: row.source_key,
        type: row.source_key === 'steam_news' ? ('news' as const) : ('patch' as const),
        title: row.title,
        sourceUrl: row.source_url,
        publishedAt: new Date(row.published_at).toISOString(),
        detectedAt: new Date(row.detected_at).toISOString(),
        isBaseline: row.is_baseline === 1,
        ...(linkedDraft === undefined ? {} : { linkedDraft })
      };
      let parseStatus: DotaEventDetailDto['parseStatus'];
      let facts: DotaPatchFactDto[];
      if (row.source_key === 'steam_news') {
        parseStatus = 'not_applicable';
        facts = [];
      } else {
        parseStatus = row.parse_status === null ? 'pending' : dotaPatchParseStatusSchema.parse(row.parse_status);
        try {
          facts = row.facts_json === null ? [] : (JSON.parse(row.facts_json) as DotaPatchFactDto[]);
        } catch {
          throw new AppError('UNAVAILABLE', 'Stored Dota analysis is invalid');
        }
      }
      const detail = dotaEventDetailSchema.safeParse({ update, parseStatus, facts });
      if (!detail.success) throw new AppError('UNAVAILABLE', 'Stored Dota analysis is invalid');
      return detail.data;
    },

    async savePatchAnalysis({ externalId, claimToken, parseStatus, facts, parsedAt = 0 }) {
      const parsedFacts = dotaPatchFactSchema.array().max(500).safeParse(facts);
      const statusAllowed = dotaPatchParseStatusSchema.safeParse(parseStatus).success;
      const statusMatchesFacts =
        parseStatus === 'complete' ? facts.length > 0 : parseStatus === 'incomplete' ? true : facts.length === 0;
      if (!parsedFacts.success || !statusAllowed || !statusMatchesFacts)
        throw new AppError('VALIDATION_ERROR', 'Patch analysis is invalid');
      const factsJson = JSON.stringify(parsedFacts.data);
      if (factsJson.length > 1_000_000) throw new AppError('VALIDATION_ERROR', 'Patch analysis is too large');
      const results = await db.batch([
        db
          .prepare(
            `INSERT INTO dota_patch_analyses (source_key, external_id, parse_status, facts_json, parsed_at)
             SELECT 'patch_notes', ?1, ?2, ?3, ?4
             WHERE EXISTS (
               SELECT 1 FROM dota_update_items
               WHERE source_key = 'patch_notes' AND external_id = ?1
             )
             ON CONFLICT (source_key, external_id) DO UPDATE SET
               parse_status = excluded.parse_status,
               facts_json = excluded.facts_json,
               parsed_at = excluded.parsed_at,
               claim_token = NULL,
               claim_until = NULL
             WHERE (dota_patch_analyses.parse_status = 'pending'
                 OR (dota_patch_analyses.parse_status = 'unavailable' AND excluded.parse_status != 'unavailable'))
             AND ((?5 IS NULL AND dota_patch_analyses.claim_token IS NULL)
               OR (?5 IS NOT NULL AND dota_patch_analyses.claim_token = ?5))`
          )
          .bind(externalId, parseStatus, factsJson, parsedAt, claimToken ?? null)
      ]);
      return results[0]?.meta.changes === 1;
    },

    async claimPendingPatchAnalyses({ claimToken, now, leaseUntil, limit }) {
      const results = await db.batch([
        db.prepare(DOTA_PENDING_PATCH_ANALYSIS_SQL).bind(claimToken, now, limit, leaseUntil),
        db
          .prepare(
            `SELECT external_id FROM dota_patch_analyses
             WHERE claim_token = ?1 AND claim_until = ?2 ORDER BY parsed_at, external_id`
          )
          .bind(claimToken, leaseUntil)
      ]);
      const rows = (results[1]?.results ?? []) as { external_id: string }[];
      return rows.map((row) => row.external_id);
    },

    async recordSourceStoreFailure({ sourceKey, detail, detectedAt }) {
      await db.batch([
        db
          .prepare('INSERT OR IGNORE INTO dota_source_state (source_key, baseline_seeded) VALUES (?1, 0)')
          .bind(sourceKey),
        db.prepare(RECORD_FEED_ERROR_SQL).bind(sourceKey, 'DOTA_SOURCE_STORE', null, detail, detectedAt)
      ]);
    },

    async recordSourceFailure({ sourceKey, code, externalId, httpStatus, detail, detectedAt, id }) {
      await db.batch([
        db
          .prepare('INSERT OR IGNORE INTO dota_source_state (source_key, baseline_seeded) VALUES (?1, 0)')
          .bind(sourceKey),
        db
          .prepare(
            'UPDATE dota_source_state SET last_attempt_at = max(COALESCE(last_attempt_at, 0), ?2) WHERE source_key = ?1'
          )
          .bind(sourceKey, detectedAt),
        // A patch-detail failure (externalId set) is not a feed failure; the feed row keeps its own state.
        ...(externalId === undefined
          ? [db.prepare(RECORD_FEED_ERROR_SQL).bind(sourceKey, code, httpStatus ?? null, detail ?? '', detectedAt)]
          : []),
        db
          .prepare(
            `INSERT OR IGNORE INTO dota_source_incidents (id, source_key, external_id, code, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5)`
          )
          .bind(id, sourceKey, externalId ?? null, code, detectedAt)
      ]);
      const result = await db
        .prepare('SELECT id FROM dota_source_incidents WHERE id = ?1')
        .bind(id)
        .first<{ id: string }>();
      if (result !== null) return id;
      const existing = await db
        .prepare(
          'SELECT id FROM dota_source_incidents WHERE source_key = ?1 AND external_id IS ?2 AND resolved_at IS NULL'
        )
        .bind(sourceKey, externalId ?? null)
        .first<{ id: string }>();
      if (existing === null) throw new Error('DOTA_INCIDENT_WRITE_FAILED');
      return existing.id;
    },

    async resolvePatchDetailFailures({ externalId, detectedAt }) {
      await db
        .prepare(
          `UPDATE dota_source_incidents SET resolved_at = max(created_at, ?1)
           WHERE source_key = 'patch_notes' AND external_id = ?2 AND code IN (
             'DOTA_PATCH_DETAIL_FETCH', 'DOTA_PATCH_DETAIL_HTTP', 'DOTA_PATCH_DETAIL_BODY_LIMIT',
             'DOTA_PATCH_DETAIL_JSON', 'DOTA_PATCH_DETAIL_SHAPE'
           ) AND resolved_at IS NULL`
        )
        .bind(detectedAt, externalId)
        .run();
    },

    async listDraftWork(limit) {
      const results = await db.batch([
        db.prepare(DOTA_DRAFT_WORK_SQL).bind(limit),
        db.prepare(DOTA_DRAFT_RECOVERY_SQL).bind(limit)
      ]);
      const newRows = ((results[0]?.results ?? []) as DotaDraftRow[]).map(toDraftSource);
      const recoveryRows = ((results[1]?.results ?? []) as DotaDraftRow[]).map(toDraftSource);
      const work: DotaDraftSource[] = [];
      while (work.length < limit && (newRows.length > 0 || recoveryRows.length > 0)) {
        const nextNew = newRows[0];
        const nextRecovery = recoveryRows[0];
        if (nextRecovery === undefined || (nextNew !== undefined && compareDotaSources(nextNew, nextRecovery) <= 0)) {
          const next = newRows.shift();
          if (next !== undefined) work.push(next);
        } else {
          const next = recoveryRows.shift();
          if (next !== undefined) work.push(next);
        }
      }
      return work;
    },

    async reserveDraft({ sourceKey, externalId, postId }) {
      const result = await db
        .prepare(
          `UPDATE dota_update_items SET draft_post_id = ?3
           WHERE source_key = ?1 AND external_id = ?2 AND is_baseline = 0 AND hidden_at IS NULL
             AND (draft_post_id IS NULL
                  OR draft_post_id IN (SELECT id FROM posts WHERE deleted_at IS NOT NULL))`
        )
        .bind(sourceKey, externalId, postId)
        .run();
      if (result.meta.changes === 1) return postId;
      const row = await db
        .prepare(
          // A hidden event or a tombstone draft is no reservation: the caller answers NOT_FOUND instead of
          // inserting a post with the tombstone's id.
          // A reservation whose post is not inserted yet (a concurrent create) still counts.
          `SELECT u.draft_post_id FROM dota_update_items u LEFT JOIN posts p ON p.id = u.draft_post_id
           WHERE u.source_key = ?1 AND u.external_id = ?2 AND u.is_baseline = 0
             AND u.hidden_at IS NULL AND p.deleted_at IS NULL`
        )
        .bind(sourceKey, externalId)
        .first<{ draft_post_id: string | null }>();
      return row?.draft_post_id ?? null;
    },

    async listAiDraftWork(limit) {
      const { results } = await db.prepare(DOTA_AI_DRAFT_WORK_SQL).bind(limit).all<DotaDraftRow>();
      return results.map(toDraftSource);
    },

    async claimAiDraft({ externalId, jobId, replay, now }) {
      const result = await db
        .prepare(
          // The earlier draft stays linked until the new job records its own, so approving it still counts. A
          // request still writing locks the event (owner, 21.10.2026: one paid call per tap, not per click).
          `UPDATE dota_update_items SET ai_job_id = ?2, ai_requested_at = ?4, is_baseline = 0
           WHERE source_key = 'steam_news' AND external_id = ?1 AND hidden_at IS NULL
             AND (ai_requested_at IS NULL OR ai_requested_at <= ?4 - ${AI_WRITING_MS})
             AND (?3 = 1 OR (ai_job_id IS NULL AND is_baseline = 0 AND draft_post_id IS NULL))`
        )
        .bind(externalId, jobId, replay ? 1 : 0, now)
        .run();
      return result.meta.changes === 1;
    },

    async finishAiDraft({ externalId, jobId }) {
      await db
        .prepare(
          `UPDATE dota_update_items SET ai_requested_at = NULL
           WHERE source_key = 'steam_news' AND external_id = ?1 AND ai_job_id = ?2`
        )
        .bind(externalId, jobId)
        .run();
    },

    async releaseAiDraft({ externalId, jobId }) {
      await db
        .prepare(
          `UPDATE dota_update_items SET ai_job_id = NULL, ai_requested_at = NULL
           WHERE source_key = 'steam_news' AND external_id = ?1 AND ai_job_id = ?2`
        )
        .bind(externalId, jobId)
        .run();
    },

    async setAiGeneration({ externalId, jobId, generationId }) {
      await db
        .prepare(
          // The newest request wins: a single draft written after a series replaces it in the studio.
          `UPDATE dota_update_items SET ai_generation_id = ?3, ai_series_id = NULL
           WHERE source_key = 'steam_news' AND external_id = ?1 AND ai_job_id = ?2`
        )
        .bind(externalId, jobId, generationId)
        .run();
    },

    async linkAiPost({ generationIds, postId, now }) {
      if (generationIds.length === 0) return null;
      // An older draft that never went out (the template of a past detection) gives way to the approved AI post;
      // one with a publication stays the event's post.
      const row = await db
        .prepare(
          `UPDATE dota_update_items SET draft_post_id = ?1, owner_alert_claimed_at = COALESCE(owner_alert_claimed_at, ?2)
           WHERE ai_generation_id IN (SELECT value FROM json_each(?3)) AND hidden_at IS NULL
             AND (draft_post_id IS NULL
                  OR NOT EXISTS (SELECT 1 FROM publications pu WHERE pu.post_id = dota_update_items.draft_post_id))
             AND draft_post_id IS NOT ?1
           RETURNING external_id`
        )
        .bind(postId, now, JSON.stringify(generationIds.slice(0, 20)))
        .first<{ external_id: string }>();
      return row?.external_id ?? null;
    },

    async findSteamAnnouncement(externalId) {
      const row = await db
        .prepare(
          `SELECT ${STEAM_ANNOUNCEMENT_COLUMNS} FROM dota_update_items u
           WHERE u.source_key = 'steam_news' AND u.external_id = ?1`
        )
        .bind(externalId)
        .first<DotaDraftRow>();
      return row === null ? null : toDraftSource(row);
    },

    async listOwnerAlertWork(limit) {
      const { results } = await db.prepare(DOTA_OWNER_ALERT_WORK_SQL).bind(limit).all<DotaDraftRow>();
      return results.map(toDraftSource);
    },

    async claimDraftOwnerAlert({ sourceKey, externalId, claimedAt }) {
      const result = await db
        .prepare(
          `UPDATE dota_update_items SET owner_alert_claimed_at = ?3
           WHERE source_key = ?1 AND external_id = ?2 AND is_baseline = 0
             AND draft_post_id IS NOT NULL AND owner_alert_claimed_at IS NULL
             AND EXISTS (SELECT 1 FROM posts WHERE id = dota_update_items.draft_post_id AND deleted_at IS NULL)`
        )
        .bind(sourceKey, externalId, claimedAt)
        .run();
      return result.meta.changes === 1;
    },

    async listSourceIncidentAlerts(limit) {
      const { results } = await db.prepare(DOTA_SOURCE_INCIDENT_ALERT_SQL).bind(limit).all<{
        id: string;
        source_key: DotaSourceKey;
        external_id: string | null;
        code: DotaWatchError['code'] | DotaPatchDetailError['code'];
        resolved_at: number | null;
      }>();
      return results.map((row) => ({
        id: row.id,
        sourceKey: row.source_key,
        externalId: row.external_id,
        code: row.code,
        resolvedAt: row.resolved_at
      }));
    },

    async claimSourceIncidentAlert({ id, claimedAt }) {
      const { results } = await db
        .prepare(
          `UPDATE dota_source_incidents SET owner_alert_claimed_at = ?2
           WHERE id = ?1 AND owner_alert_claimed_at IS NULL RETURNING resolved_at`
        )
        .bind(id, claimedAt)
        .all<{ resolved_at: number | null }>();
      const row = results[0];
      return row === undefined ? null : { resolvedAt: row.resolved_at };
    }
  };
}

interface DotaIntelligenceRow {
  source_key: DotaSourceKey;
  external_id: string;
  title: string;
  source_url: string;
  published_at: number;
  detected_at: number;
  is_baseline: number;
  linked_draft_id: string | null;
  linked_draft_title: string | null;
}

interface DotaDetailRow extends DotaIntelligenceRow {
  parse_status: string | null;
  facts_json: string | null;
}

function isOfficialStoredUrl(sourceKey: DotaSourceKey, externalId: string, raw: string): boolean {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== '')
      return false;
    if (sourceKey === 'patch_notes')
      return url.hostname === 'www.dota2.com' && url.pathname === `/patches/${encodeURIComponent(externalId)}`;
    return (
      url.hostname === 'store.steampowered.com' &&
      (url.pathname === `/news/externalpost/steam_community_announcements/${encodeURIComponent(externalId)}` ||
        url.pathname === `/news/app/570/view/${encodeURIComponent(externalId)}`)
    );
  } catch {
    return false;
  }
}

interface DotaDraftRow {
  source_key: DotaSourceKey;
  external_id: string;
  title: string;
  source_url: string;
  published_at: number;
  is_baseline: number;
  draft_post_id: string | null;
  excerpt: string | null;
  event_type: SourceEventType;
}

function toDraftSource(row: DotaDraftRow): DotaDraftSource {
  return {
    sourceKey: row.source_key,
    externalId: row.external_id,
    title: row.title,
    sourceUrl: row.source_url,
    publishedAt: row.published_at,
    isBaseline: row.is_baseline === 1,
    draftPostId: row.draft_post_id,
    excerpt: row.excerpt,
    // Patch notes are always a patch: a row inserted by an older Worker between migration 0037 and the
    // deploy keeps the column default 'news'.
    eventType: row.source_key === 'patch_notes' ? 'patch' : row.event_type
  };
}

function compareDotaSources(left: DotaDraftSource, right: DotaDraftSource): number {
  return (
    left.publishedAt - right.publishedAt ||
    left.sourceKey.localeCompare(right.sourceKey) ||
    left.externalId.localeCompare(right.externalId)
  );
}
export {
  createD1TreasureWatchRepository,
  factKind,
  type TreasureFactKind,
  type TreasureFactTexts,
  type TreasureWatch,
  type TreasureWatchRepository
} from './treasure-watch-repository';
export {
  isHotfixTitle,
  type PatchDigest,
  patchNotesText,
  type PatchEntityNotes,
  patchPicturePoints,
  patchVersionOf
} from './patch-digest';
