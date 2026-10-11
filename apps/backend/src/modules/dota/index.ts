import { z } from 'zod';
import type { DotaIntelligenceDto, DotaSourceKey as ContractDotaSourceKey } from '@alexeev/contracts';

export const DOTA_SOURCE_KEYS = ['steam_news', 'patch_notes'] as const;
export type DotaSourceKey = (typeof DOTA_SOURCE_KEYS)[number];

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
const INSERT_CHUNK_SIZE = 20;

export class DotaWatchError extends Error {
  constructor(
    readonly code:
      'DOTA_SOURCE_FETCH' | 'DOTA_SOURCE_HTTP' | 'DOTA_SOURCE_BODY_LIMIT' | 'DOTA_SOURCE_JSON' | 'DOTA_SOURCE_SHAPE',
    readonly sourceKey: DotaSourceKey
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
        redirect: 'error'
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
        redirect: 'error'
      });
    },
    async fetchPatchNameMaps() {
      const request = (url: string) =>
        fetchImpl(url, {
          method: 'GET',
          headers: { accept: 'application/json' },
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
          redirect: 'error'
        });
      if (nameMapsPromise === null) {
        nameMapsPromise = (async () => {
          let responses: [Response, Response];
          try {
            responses = await Promise.all([
              request('https://www.dota2.com/datafeed/herolist?language=english'),
              request('https://www.dota2.com/datafeed/itemlist?language=english')
            ]);
          } catch {
            throw new DotaWatchError('DOTA_SOURCE_FETCH', 'patch_notes');
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
                    name_english_loc: z.string().trim().min(1).max(200).optional(),
                    name_loc: z.string().trim().min(1).max(200).optional()
                  })
                  .passthrough()
              )
              .max(200)
              .optional(),
            itemabilities: z
              .array(
                z
                  .object({
                    id: z.number().int(),
                    name_english_loc: z.string().trim().min(1).max(200).optional(),
                    name_loc: z.string().trim().min(1).max(200).optional()
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

export function parsePatchNameMaps(
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
        cleanPatchLabel(entry.name_english_loc ?? entry.name_loc)
      ])
    ),
    items: new Map(
      itemsParsed.data.result.data.itemabilities.map((entry) => [
        entry.id,
        cleanPatchLabel(entry.name_english_loc ?? entry.name_loc)
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

export async function summarizeOfficialPatch(
  fetcher: DotaSourceFetcher,
  version: string
): Promise<DotaPatchSummary | null> {
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
  return rankedThemes.length === 0 || unresolvedEntities
    ? null
    : { patchNumber: parsed.data.patch_number, title: parsed.data.patch_name, themes: rankedThemes };
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
}

export interface DotaWatcherRepository {
  storeSync(input: { items: DotaUpdateItem[]; detectedAt: number }): Promise<{ inserted: number }>;
  recordSourceAttempt(input: { sourceKey: DotaSourceKey; attemptedAt: number }): Promise<void>;
  storeSourceSync(input: {
    sourceKey: DotaSourceKey;
    items: DotaUpdateItem[];
    detectedAt: number;
  }): Promise<{ inserted: number }>;
  listIntelligence(input: { source?: ContractDotaSourceKey; limit: number; now: number }): Promise<DotaIntelligenceDto>;
  recordSourceFailure(input: {
    sourceKey: DotaSourceKey;
    code: DotaWatchError['code'] | DotaPatchDetailError['code'];
    externalId?: string;
    detectedAt: number;
    id: string;
  }): Promise<string>;
  resolvePatchDetailFailures(input: { externalId: string; detectedAt: number }): Promise<void>;
  listDraftWork(limit: number): Promise<DotaDraftSource[]>;
  reserveDraft(input: { sourceKey: DotaSourceKey; externalId: string; postId: string }): Promise<string | null>;
  listOwnerAlertWork(limit: number): Promise<DotaDraftSource[]>;
  claimDraftOwnerAlert(input: { sourceKey: DotaSourceKey; externalId: string; claimedAt: number }): Promise<boolean>;
  listSourceIncidentAlerts(limit: number): Promise<DotaSourceIncident[]>;
  claimSourceIncidentAlert(input: { id: string; claimedAt: number }): Promise<{ resolvedAt: number | null } | null>;
}

export interface DotaDraftSource extends DotaUpdateItem {
  isBaseline: boolean;
  draftPostId: string | null;
}

export interface DotaSourceIncident {
  id: string;
  sourceKey: DotaSourceKey;
  externalId: string | null;
  code: DotaWatchError['code'] | DotaPatchDetailError['code'];
  resolvedAt: number | null;
}

export const DOTA_DRAFT_WORK_SQL = `
  SELECT u.source_key, u.external_id, u.title, u.source_url, u.published_at, u.is_baseline, u.draft_post_id
  FROM dota_update_items u INDEXED BY dota_draft_candidates_idx
  WHERE u.is_baseline = 0 AND u.draft_post_id IS NULL
  ORDER BY u.published_at, u.source_key, u.external_id LIMIT ?1`;

export const DOTA_DRAFT_RECOVERY_SQL = `
  SELECT u.source_key, u.external_id, u.title, u.source_url, u.published_at, u.is_baseline, u.draft_post_id
  FROM dota_update_items u INDEXED BY dota_draft_recovery_idx LEFT JOIN posts p ON p.id = u.draft_post_id
  WHERE u.is_baseline = 0 AND u.draft_post_id IS NOT NULL AND u.owner_alert_claimed_at IS NULL AND p.id IS NULL
  ORDER BY u.published_at, u.source_key, u.external_id LIMIT ?1`;

export const DOTA_OWNER_ALERT_WORK_SQL = `
  SELECT u.source_key, u.external_id, u.title, u.source_url, u.published_at, u.is_baseline, u.draft_post_id
  FROM dota_update_items u INDEXED BY dota_draft_recovery_idx JOIN posts p ON p.id = u.draft_post_id
  WHERE u.is_baseline = 0 AND u.draft_post_id IS NOT NULL AND u.owner_alert_claimed_at IS NULL
  ORDER BY u.published_at, u.source_key, u.external_id LIMIT ?1`;

export const DOTA_SOURCE_INCIDENT_ALERT_SQL = `
  SELECT id, source_key, external_id, code, resolved_at FROM dota_source_incidents INDEXED BY dota_source_incidents_alert_idx
  WHERE owner_alert_claimed_at IS NULL
  ORDER BY created_at, id LIMIT ?1`;

export const DOTA_PATCH_DETAIL_INCIDENT_RECOVERY_SQL = `
  SELECT id FROM dota_source_incidents
  WHERE source_key = 'patch_notes'
    AND external_id IS NOT NULL
    AND code IN (
      'DOTA_PATCH_DETAIL_FETCH', 'DOTA_PATCH_DETAIL_HTTP', 'DOTA_PATCH_DETAIL_BODY_LIMIT',
      'DOTA_PATCH_DETAIL_JSON', 'DOTA_PATCH_DETAIL_SHAPE'
    )
    AND resolved_at IS NULL`;

async function readBoundedJson(response: Response, maximumBytes: number, sourceKey: DotaSourceKey): Promise<unknown> {
  if (!response.ok) throw new DotaWatchError('DOTA_SOURCE_HTTP', sourceKey);
  if (response.body === null) throw new DotaWatchError('DOTA_SOURCE_JSON', sourceKey);

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
        throw new DotaWatchError('DOTA_SOURCE_BODY_LIMIT', sourceKey);
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
  } catch {
    throw new DotaWatchError('DOTA_SOURCE_JSON', sourceKey);
  }
}

function parseSteamNews(payload: unknown): DotaUpdateItem[] {
  const parsed = steamNewsSchema.safeParse(payload);
  if (!parsed.success) throw new DotaWatchError('DOTA_SOURCE_SHAPE', 'steam_news');
  const official: DotaUpdateItem[] = [];
  for (const news of parsed.data.appnews.newsitems) {
    if (news.feedname !== 'steam_community_announcements') continue;
    const url = new URL(news.url);
    const allowedHost = url.hostname === 'store.steampowered.com' || url.hostname === 'steamstore-a.akamaihd.net';
    const officialPath =
      url.pathname === `/news/app/570/view/${news.gid}` ||
      url.pathname === `/news/externalpost/steam_community_announcements/${news.gid}`;
    if (!['http:', 'https:'].includes(url.protocol) || !allowedHost || !officialPath) {
      throw new DotaWatchError('DOTA_SOURCE_SHAPE', 'steam_news');
    }
    official.push({
      sourceKey: 'steam_news',
      externalId: news.gid,
      title: news.title,
      sourceUrl: `https://store.steampowered.com/news/externalpost/steam_community_announcements/${encodeURIComponent(news.gid)}`,
      publishedAt: news.date * 1_000
    });
  }
  return official;
}

function parsePatchList(payload: unknown): DotaUpdateItem[] {
  const parsed = patchListSchema.safeParse(payload);
  if (!parsed.success) throw new DotaWatchError('DOTA_SOURCE_SHAPE', 'patch_notes');
  return parsed.data.patches.map((patch) => ({
    sourceKey: 'patch_notes',
    externalId: patch.patch_number,
    title: `Dota ${patch.patch_name}`,
    sourceUrl: `https://www.dota2.com/patches/${encodeURIComponent(patch.patch_number)}`,
    publishedAt: patch.patch_timestamp * 1_000
  }));
}

export async function syncDotaUpdates(input: {
  fetcher: DotaSourceFetcher;
  repo: DotaWatcherRepository;
  detectedAt: number;
}): Promise<{ inserted: number; fetched: number }> {
  const syncSource = async (sourceKey: DotaSourceKey): Promise<{ inserted: number; fetched: number }> => {
    try {
      await input.repo.recordSourceAttempt({ sourceKey, attemptedAt: input.detectedAt });
      const response = await input.fetcher.fetch(sourceKey);
      const payload = await readBoundedJson(
        response,
        sourceKey === 'steam_news' ? MAX_STEAM_BYTES : MAX_PATCH_BYTES,
        sourceKey
      );
      const items = sourceKey === 'steam_news' ? parseSteamNews(payload) : parsePatchList(payload);
      const stored = await input.repo.storeSourceSync({ sourceKey, items, detectedAt: input.detectedAt });
      return { inserted: stored.inserted, fetched: 1 };
    } catch (error) {
      const classified = error instanceof DotaWatchError ? error : new DotaWatchError('DOTA_SOURCE_FETCH', sourceKey);
      await input.repo.recordSourceFailure({
        sourceKey,
        code: classified.code,
        detectedAt: input.detectedAt,
        id: crypto.randomUUID()
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

    async storeSourceSync({ sourceKey, items, detectedAt }) {
      const statements: D1PreparedStatement[] = [
        db
          .prepare('INSERT OR IGNORE INTO dota_source_state (source_key, baseline_seeded) VALUES (?1, 0)')
          .bind(sourceKey)
      ];
      const insertIndexes: number[] = [];
      for (let start = 0; start < items.length; start += INSERT_CHUNK_SIZE) {
        const chunk = items.slice(start, start + INSERT_CHUNK_SIZE);
        const sourceLiteral = sourceKey === 'steam_news' ? "'steam_news'" : "'patch_notes'";
        const values = chunk
          .map(
            () =>
              `(${sourceLiteral}, ? , ?, ?, ?, ?, (SELECT CASE WHEN baseline_seeded = 0 THEN 1 ELSE 0 END FROM dota_source_state WHERE source_key = ${sourceLiteral}))`
          )
          .join(', ');
        const bindings: (string | number)[] = [];
        for (const item of chunk)
          bindings.push(item.externalId, item.title, item.sourceUrl, item.publishedAt, detectedAt);
        insertIndexes.push(statements.length);
        statements.push(
          db
            .prepare(
              `INSERT OR IGNORE INTO dota_update_items (source_key, external_id, title, source_url, published_at, detected_at, is_baseline) VALUES ${values}`
            )
            .bind(...bindings)
        );
      }
      statements.push(
        db
          .prepare(
            'UPDATE dota_source_state SET baseline_seeded = 1, last_attempt_at = max(COALESCE(last_attempt_at, 0), ?2), last_success_at = max(COALESCE(last_success_at, 0), ?2) WHERE source_key = ?1'
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
        .prepare('SELECT source_key, baseline_seeded, last_attempt_at, last_success_at FROM dota_source_state')
        .all<{
          source_key: DotaSourceKey;
          baseline_seeded: number;
          last_attempt_at: number | null;
          last_success_at: number | null;
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
           FROM dota_update_items u LEFT JOIN posts p ON p.id = u.draft_post_id
           ORDER BY u.published_at DESC, u.source_key ASC, u.external_id ASC LIMIT ?1`
          : `SELECT u.source_key, u.external_id, u.title, u.source_url, u.published_at, u.detected_at, u.is_baseline,
                  p.id AS linked_draft_id, p.title AS linked_draft_title
           FROM dota_update_items u LEFT JOIN posts p ON p.id = u.draft_post_id
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
        const hasSourceIncident = sourceIncidents.has(key);
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

    async recordSourceFailure({ sourceKey, code, externalId, detectedAt, id }) {
      await db.batch([
        db
          .prepare('INSERT OR IGNORE INTO dota_source_state (source_key, baseline_seeded) VALUES (?1, 0)')
          .bind(sourceKey),
        db
          .prepare(
            'UPDATE dota_source_state SET last_attempt_at = max(COALESCE(last_attempt_at, 0), ?2) WHERE source_key = ?1'
          )
          .bind(sourceKey, detectedAt),
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
           WHERE source_key = ?1 AND external_id = ?2 AND is_baseline = 0 AND draft_post_id IS NULL`
        )
        .bind(sourceKey, externalId, postId)
        .run();
      if (result.meta.changes === 1) return postId;
      const row = await db
        .prepare(
          'SELECT draft_post_id FROM dota_update_items WHERE source_key = ?1 AND external_id = ?2 AND is_baseline = 0'
        )
        .bind(sourceKey, externalId)
        .first<{ draft_post_id: string | null }>();
      return row?.draft_post_id ?? null;
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
             AND EXISTS (SELECT 1 FROM posts WHERE id = dota_update_items.draft_post_id)`
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
}

function toDraftSource(row: DotaDraftRow): DotaDraftSource {
  return {
    sourceKey: row.source_key,
    externalId: row.external_id,
    title: row.title,
    sourceUrl: row.source_url,
    publishedAt: row.published_at,
    isBaseline: row.is_baseline === 1,
    draftPostId: row.draft_post_id
  };
}

function compareDotaSources(left: DotaDraftSource, right: DotaDraftSource): number {
  return (
    left.publishedAt - right.publishedAt ||
    left.sourceKey.localeCompare(right.sourceKey) ||
    left.externalId.localeCompare(right.externalId)
  );
}
