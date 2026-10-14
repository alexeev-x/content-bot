import {
  type CreatePostInput,
  createPostInputSchema,
  POST_BODY_MAX,
  POST_ENTITIES_MAX,
  POST_TITLE_MAX,
  type PostEntity,
  postEntitySchema
} from '@alexeev/contracts';
import type { MessageEntity } from 'grammy/types';

export type DraftFromMessage =
  { ok: true; input: CreatePostInput } | { ok: false; reason: 'TOO_LONG' | 'INVALID_TEXT' };

const ELLIPSIS = '…';

/** Title of a draft whose message carried media but no caption (or whose caption has not arrived yet). */
export const MEDIA_DRAFT_TITLE = 'Медиа из Telegram';

// One UTF-16 unit of the message together with its index in the original text, so every cut and
// trim below keeps the entity offsets of Telegram (which count units of the original text) resolvable.
interface Unit {
  char: string;
  at: number;
}

const toText = (units: readonly Unit[]) => units.map((unit) => unit.char).join('');

function trimUnits(units: Unit[]): Unit[] {
  let start = 0;
  let end = units.length;
  while (start < end && /\s/.test(units[start]?.char ?? '')) start += 1;
  while (end > start && /\s/.test(units[end - 1]?.char ?? '')) end -= 1;
  return units.slice(start, end);
}

// Runs of tabs and blanks mean nothing in a title (and a title may not hold a tab).
function collapseBlanks(units: Unit[]): Unit[] {
  const out: Unit[] = [];
  for (const unit of units) {
    const blank = unit.char === ' ' || unit.char === '\t';
    const previous = out[out.length - 1];
    if (blank && previous !== undefined && previous.char === ' ') continue;
    out.push(blank ? { char: ' ', at: unit.at } : unit);
  }
  return out;
}

function normalizeLineBreaks(text: string): Unit[] {
  const out: Unit[] = [];
  for (let at = 0; at < text.length; at += 1) {
    const char = text.charAt(at);
    if (char === '\r') {
      // CRLF is one break: the LF carries it, the CR is dropped.
      if (text.charAt(at + 1) !== '\n') out.push({ char: '\n', at });
      continue;
    }
    out.push({ char, at });
  }
  return out;
}

function mapEntity(entity: MessageEntity): PostEntity | null {
  const range = { offset: entity.offset, length: entity.length };
  switch (entity.type) {
    case 'bold':
    case 'italic':
    case 'underline':
    case 'strikethrough':
    case 'spoiler':
    case 'code':
    case 'blockquote':
      return { type: entity.type, ...range } as PostEntity;
    case 'expandable_blockquote':
      return { type: 'blockquote', ...range };
    case 'pre':
      return entity.language === undefined || entity.language === ''
        ? { type: 'pre', ...range }
        : { type: 'pre', ...range, language: entity.language };
    case 'text_link':
      try {
        return { type: 'text_link', ...range, url: new URL(entity.url).href };
      } catch {
        return null;
      }
    default:
      // Mentions, hashtags, bare links, custom emoji and the rest are not formatting the editor stores.
      return null;
  }
}

// Moves an entity from offsets of the original text to offsets of the body. Only the units that survive
// into the body count, so an entity inside the title (or in trimmed blanks) disappears and one that
// straddles the title keeps just its part in the body.
function entitiesOfBody(entities: readonly MessageEntity[], body: readonly Unit[]): PostEntity[] {
  const out: PostEntity[] = [];
  for (const entity of entities) {
    const end = entity.offset + entity.length;
    let first = -1;
    let last = -1;
    for (let index = 0; index < body.length; index += 1) {
      const at = body[index]?.at ?? -1;
      if (at >= entity.offset && at < end) {
        if (first === -1) first = index;
        last = index;
      }
    }
    if (first === -1) continue;
    const mapped = mapEntity({ ...entity, offset: first, length: last - first + 1 });
    const parsed = postEntitySchema.safeParse(mapped);
    if (parsed.success) out.push(parsed.data);
    if (out.length === POST_ENTITIES_MAX) break;
  }
  return out;
}

// The text is kept whole: the first line becomes the title and everything after it the body. A first
// line longer than the title allows is cut at the limit (never between the two halves of an emoji) and the
// remainder of that line stays at the start of the body, so no character is lost. Telegram formatting
// (`entities`, offsets in UTF-16 units) is carried to the body; the part that falls into the title is
// dropped. If the contract refuses the carried formatting (say, an overlap the editor cannot hold), the
// draft keeps its text and loses only the formatting.
export function draftFromMessageText(text: string, entities: readonly MessageEntity[] = []): DraftFromMessage {
  const units = trimUnits(normalizeLineBreaks(text));
  const newline = units.findIndex((unit) => unit.char === '\n');
  const firstLine = newline === -1 ? units : units.slice(0, newline);
  let body = newline === -1 ? [] : trimUnits(units.slice(newline + 1));

  let title = trimUnits(collapseBlanks(firstLine));
  if (title.length > POST_TITLE_MAX) {
    // Room for the ellipsis; the cut moves back by one when it would split a surrogate pair.
    let cut = POST_TITLE_MAX - ELLIPSIS.length;
    const last = (title[cut - 1]?.char ?? '').charCodeAt(0);
    if (last >= 0xd800 && last <= 0xdbff) cut -= 1;
    const rest = trimUnits(title.slice(cut));
    title = [...trimUnits(title.slice(0, cut)), { char: ELLIPSIS, at: title[cut - 1]?.at ?? 0 }];
    const separator = { char: '\n', at: newline === -1 ? (rest[rest.length - 1]?.at ?? 0) : (units[newline]?.at ?? 0) };
    body = rest.length === 0 ? body : body.length === 0 ? rest : [...rest, separator, ...body];
  }
  if (body.length > POST_BODY_MAX) return { ok: false, reason: 'TOO_LONG' };

  const bodyText = toText(body);
  // The contract schema is the one authority on what a post may hold (control characters, lone surrogates).
  const withFormatting = createPostInputSchema.safeParse({
    title: toText(title),
    body: bodyText,
    entities: entitiesOfBody(entities, body)
  });
  if (withFormatting.success) return { ok: true, input: withFormatting.data };
  const plain = createPostInputSchema.safeParse({ title: toText(title), body: bodyText });
  return plain.success ? { ok: true, input: plain.data } : { ok: false, reason: 'INVALID_TEXT' };
}

// A caption is the post's text, exactly as a text message is. Without one the draft only has the media.
export function draftFromCaption(
  caption: string | undefined,
  entities: readonly MessageEntity[] = []
): DraftFromMessage {
  if (caption === undefined || caption.trim() === '') return { ok: true, input: mediaOnlyDraft() };
  return draftFromMessageText(caption, entities);
}

export function mediaOnlyDraft(): CreatePostInput {
  return { title: MEDIA_DRAFT_TITLE, body: '', entities: [] };
}
