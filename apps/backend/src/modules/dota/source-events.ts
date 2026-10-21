import type { CreatePostInput, DotaPatchFactDto } from '@alexeev/contracts';

export type DotaSourceKey = 'steam_news' | 'patch_notes';
export type SourceEventType = 'patch' | 'treasure' | 'news';

const MAX_TITLE = 200;
const MAX_SUMMARY = 240;
const MAX_LISTED_ENTITIES = 15;
const EXCERPT_STORE_MAX = 600;

// Best effort, documented in docs/backend/sources.md: a patch is a patch note; a Steam announcement is
// a treasure when its title or opening text names a treasure, a collector's cache or a cosmetic set;
// anything else is news. English and Russian wording; a miss costs only a different draft template.
const TREASURE_PATTERN =
  /\btreasures?\b|collector.?s cache|\b(?:cosmetic|immortal|arcana|hero|player) sets?\b|сокровищ|набор[а-яё]*\s+(?:косметик|предмет)/iu;

export function classifyDotaEvent(input: {
  sourceKey: DotaSourceKey;
  title: string;
  excerpt: string | null;
}): SourceEventType {
  if (input.sourceKey === 'patch_notes') return 'patch';
  return TREASURE_PATTERN.test(`${input.title}\n${input.excerpt ?? ''}`) ? 'treasure' : 'news';
}

// Steam announcement bodies are BBCode/HTML with image placeholders. Keep plain text only: tags,
// links and image macros are dropped, never copied into a draft. `paragraphs` keeps a blank line between blocks
// (the whole announcement in the side panel); otherwise everything is one line.
export function cleanExcerpt(raw: string | undefined, max = EXCERPT_STORE_MAX, paragraphs = false): string | null {
  if (raw === undefined) return null;
  const block = paragraphs ? '\n\n' : ' ';
  const stripped = raw
    // The tag before the macro: `[img src="{STEAM_CLAN_LOC_IMAGE}/….png"][/img]` would otherwise lose its macro first
    // and leave `[img src="`; the macro stops at a quote or a bracket, so it never eats the next word.
    .replace(/\[(?:img|previewyoutube|video)[^\]]*\][\s\S]*?\[\/(?:img|previewyoutube|video)\]/gi, ' ')
    .replace(/\{STEAM_CLAN_(?:LOC_)?IMAGE\}[^\s"[\]]*/g, ' ')
    .replace(/\[\/?(?:p|h\d|br|list|\*|quote|table|tr|td|hr)\b[^\]]{0,80}\]/gi, block)
    .replace(/\[[^\]]{1,80}\]/g, '')
    .replace(/<\/?(?:p|br|div|li|ul|h\d)\b[^>]{0,200}>/gi, block)
    .replace(/<[^>]{1,200}>/g, '')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
  const text = (
    paragraphs
      ? stripped
          .replace(/[^\S\n]+/g, ' ')
          .replace(/ ?\n ?/g, '\n')
          .replace(/\n{3,}/g, '\n\n')
      : stripped.replace(/\s+/g, ' ')
  )
    .trim()
    .slice(0, max)
    .trim();
  return text === '' ? null : text;
}

export function firstSentence(text: string | null, max = MAX_SUMMARY): string | null {
  if (text === null) return null;
  const match = /^.+?[.!?…](?=\s|$)/su.exec(text);
  const sentence = (match?.[0] ?? text).trim();
  if (sentence === '') return null;
  return sentence.length <= max ? sentence : `${sentence.slice(0, max - 1).trimEnd()}…`;
}

export interface ChangedEntity {
  kind: 'hero' | 'item';
  name: string;
}

// The distinct heroes and items a patch changed, in first-seen order. Neutral items count as items.
export function changedEntities(
  facts: readonly Pick<DotaPatchFactDto, 'entityType' | 'entityName'>[]
): ChangedEntity[] {
  const seen = new Set<string>();
  const out: ChangedEntity[] = [];
  for (const fact of facts) {
    if (fact.entityType === 'general' || fact.entityType === 'neutral_creep') continue;
    const kind = fact.entityType === 'hero' ? 'hero' : 'item';
    const key = watchKey(kind, fact.entityName);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ kind, name: fact.entityName });
  }
  return out;
}

// The same identity the watchlists use: NFKC, trimmed, lower-cased.
export const watchKey = (kind: 'hero' | 'item', name: string): string =>
  `${kind}:${name.normalize('NFKC').trim().toLocaleLowerCase('en-US')}`;

// Watched entities first, then the order the notes list them in.
export function orderEntities(entities: readonly ChangedEntity[], watched: ReadonlySet<string>): ChangedEntity[] {
  const isWatched = (entity: ChangedEntity) => watched.has(watchKey(entity.kind, entity.name));
  return [...entities.filter(isWatched), ...entities.filter((entity) => !isWatched(entity))];
}

export function eventSummary(input: {
  type: SourceEventType;
  title: string;
  excerpt: string | null;
  entities: readonly ChangedEntity[];
}): string {
  if (input.type === 'patch') {
    const heroes = input.entities.filter((entity) => entity.kind === 'hero').length;
    const items = input.entities.length - heroes;
    return input.entities.length === 0
      ? 'Список изменений пока не разобран.'
      : `Изменено героев: ${heroes}, предметов: ${items}.`;
  }
  return firstSentence(input.excerpt) ?? input.title;
}

const clip = (value: string, max: number): string => (value.length <= max ? value : `${value.slice(0, max - 1)}…`);

export interface EventDraftSource {
  type: SourceEventType;
  externalId: string;
  title: string;
  excerpt: string | null;
  sourceUrl: string;
}

// Per-type Russian templates. They only rearrange what the source states: nothing is generated, and no
// image is copied. AI text comes later; until then the owner edits the draft in the Studio.
export function buildEventDraft(
  source: EventDraftSource,
  entities: readonly ChangedEntity[],
  watched: ReadonlySet<string> = new Set()
): CreatePostInput {
  const link = `Источник: ${source.sourceUrl}`;
  if (source.type === 'patch') {
    const title = clip(`Патч ${source.externalId}: что изменилось`, MAX_TITLE);
    const ordered = orderEntities(entities, watched);
    const listed = ordered.slice(0, MAX_LISTED_ENTITIES);
    const lines = listed.map((entity) => `— ${entity.name} (${entity.kind === 'hero' ? 'герой' : 'предмет'})`);
    const rest = ordered.length - listed.length;
    if (rest > 0) lines.push(`и ещё ${rest}`);
    const list =
      lines.length === 0
        ? 'Список изменений пока не разобран: откройте официальные заметки.'
        : `Изменились:\n${lines.join('\n')}`;
    return headed(title, `${title}\n\n${list}\n\n${link}`);
  }
  const summary = firstSentence(source.excerpt);
  if (source.type === 'treasure') {
    const title = clip(`Новая сокровищница: ${source.title}`, MAX_TITLE);
    const parts = [title, ...(summary === null ? [] : [summary]), link];
    return headed(title, parts.join('\n\n'));
  }
  const title = clip(source.title, MAX_TITLE);
  const parts = [title, ...(summary === null || summary === title ? [] : [summary]), link];
  return headed(title, parts.join('\n\n'));
}

// No post title (owner, 16.10.2026): the heading is the body's first line, made bold — sent once, not as a
// title above a body that repeats it. Offsets are UTF-16 units, which String#length counts.
function headed(heading: string, body: string): CreatePostInput {
  return { body, entities: [{ type: 'bold', offset: 0, length: heading.length }], kind: 'text' };
}
