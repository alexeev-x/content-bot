import { z } from 'zod';

// A post body is plain text plus Telegram MessageEntity ranges, never markup. Offsets and lengths
// are UTF-16 code units (JavaScript `String#length`) relative to the body, the unit Telegram uses.

export const POST_ENTITIES_MAX = 100;
export const POST_ENTITY_URL_MAX = 2048;
export const POST_ENTITY_LANGUAGE_MAX = 64;
/**
 * The cap on the whole entity list serialized as compact JSON (what the database stores). It is sized
 * so that a maximum post still fits every bounded container: the 32 KB request cap (12 288 body bytes
 * + 600 title bytes + this list + a few dozen bytes of keys is about 29.4 KB), the 32 768-character
 * idempotency response, and the CHECK on the entities columns. A list of 100 links therefore averages
 * about 160 characters per entity; one link may still be up to 2048 characters.
 */
export const POST_ENTITIES_JSON_MAX = 16384;

// Equals the 4096-character body limit in posts.ts (which imports this file, so it cannot be shared).
const TEXT_UNITS_MAX = 4096;

const range = {
  offset: z.number().int().nonnegative().max(TEXT_UNITS_MAX),
  length: z.number().int().min(1).max(TEXT_UNITS_MAX)
};

const styled = <T extends 'bold' | 'italic' | 'underline' | 'strikethrough' | 'spoiler' | 'code' | 'blockquote'>(
  type: T
) => z.strictObject({ type: z.literal(type), ...range });

// Printable ASCII without `"` and `\`: the stored JSON then needs no escaping, so its length is its size
// in bytes. A client turns any address into this form with `new URL(address).href`.
const URL_CHARACTERS = /^[\x21\x23-\x5b\x5d-\x7e]+$/;
const URL_SCHEME = /^(https?|tg):\/\/[^/?#]+/i;

const urlSchema = z
  .url({ protocol: /^(https?|tg)$/i })
  .max(POST_ENTITY_URL_MAX)
  .regex(URL_SCHEME, { error: 'Link must start with http://, https:// or tg://' })
  .regex(URL_CHARACTERS, { error: 'Link must be ASCII without spaces, quotes or backslashes' });

export const postEntitySchema = z.discriminatedUnion('type', [
  styled('bold'),
  styled('italic'),
  styled('underline'),
  styled('strikethrough'),
  styled('spoiler'),
  styled('code'),
  styled('blockquote'),
  z.strictObject({
    type: z.literal('pre'),
    ...range,
    language: z
      .string()
      .max(POST_ENTITY_LANGUAGE_MAX)
      .regex(/^[a-z0-9+#_-]+$/i)
      .optional()
  }),
  z.strictObject({ type: z.literal('text_link'), ...range, url: urlSchema })
]);
export type PostEntity = z.infer<typeof postEntitySchema>;
export type PostEntityType = PostEntity['type'];

/** The entity list as the schemas parse it, before it is checked against a body. */
export const postEntityListSchema = z.array(postEntitySchema).max(POST_ENTITIES_MAX);

// Why a list is refused. These double as `details.reason` codes of VALIDATION_ERROR.
export const POST_ENTITY_ISSUE_CODES = [
  'ENTITIES_TOO_MANY',
  'ENTITIES_TOO_LARGE',
  'ENTITIES_OUT_OF_RANGE',
  'ENTITIES_SPLIT_SURROGATE',
  'ENTITIES_INVALID_NESTING',
  // The body changed without the entity list that goes with it: old offsets would point at other text.
  'ENTITIES_REQUIRED'
] as const;
export type PostEntityIssueCode = (typeof POST_ENTITY_ISSUE_CODES)[number];

export interface PostEntityIssue {
  code: PostEntityIssueCode;
  /** Position in the list of the entity at fault; absent for list-wide issues. */
  index?: number;
}

// Innermost-last order for equal ranges: what may contain what (see `canContain`) read left to right.
const TYPE_ORDER: Record<PostEntityType, number> = {
  blockquote: 0,
  bold: 1,
  italic: 2,
  underline: 3,
  strikethrough: 4,
  spoiler: 5,
  text_link: 6,
  code: 7,
  pre: 8
};

const attribute = (entity: PostEntity): string =>
  entity.type === 'text_link' ? entity.url : entity.type === 'pre' ? (entity.language ?? '') : '';

function compare(a: PostEntity, b: PostEntity): number {
  if (a.offset !== b.offset) return a.offset - b.offset;
  if (a.length !== b.length) return b.length - a.length;
  if (a.type !== b.type) return TYPE_ORDER[a.type] - TYPE_ORDER[b.type];
  const left = attribute(a);
  const right = attribute(b);
  return left < right ? -1 : left > right ? 1 : 0;
}

// The five styles that Telegram lets nest freely. They carry no attributes and mean the same thing wherever
// they sit, so a partial overlap between two of them can be cut into nested and disjoint pieces without
// changing what any character looks like.
const FREE_STYLES: ReadonlySet<PostEntityType> = new Set(['bold', 'italic', 'underline', 'strikethrough', 'spoiler']);

const endOf = (entity: PostEntity): number => entity.offset + entity.length;

// Where a free style must be cut: if `a` starts first and ends inside `b`, then `b` is cut at the end of `a`,
// so one piece sits inside `a` and the other starts where `a` ends. A cut can leave a piece that partially
// overlaps a third entity, so passes repeat until every pair is nested or disjoint. Each cut raises the
// entity count, and a list past the limit is returned as it is for the validator to refuse (ENTITIES_TOO_MANY),
// which keeps the work bounded.
function splitPartialOverlaps(entities: readonly PostEntity[]): PostEntity[] {
  let current = [...entities].sort(compare);
  while (current.length <= POST_ENTITIES_MAX) {
    const cuts = new Map<number, Set<number>>();
    for (const [i, a] of current.entries()) {
      if (!FREE_STYLES.has(a.type)) continue;
      for (const [j, b] of current.entries()) {
        if (i === j || !FREE_STYLES.has(b.type)) continue;
        if (a.offset < b.offset && b.offset < endOf(a) && endOf(a) < endOf(b)) {
          const at = cuts.get(j);
          if (at === undefined) cuts.set(j, new Set([endOf(a)]));
          else at.add(endOf(a));
        }
      }
    }
    if (cuts.size === 0) return current;

    const next: PostEntity[] = [];
    for (const [index, entity] of current.entries()) {
      const points = [...(cuts.get(index) ?? [])].sort((x, y) => x - y);
      let start = entity.offset;
      for (const point of [...points, endOf(entity)]) {
        next.push({ ...entity, offset: start, length: point - start });
        start = point;
      }
    }
    current = next.sort(compare);
  }
  return current;
}

/**
 * The canonical form the server stores: same-type entities with the same attributes (link address, code
 * language) that touch or overlap become one; then bold, italic, underline, strikethrough and spoiler that
 * partially overlap each other are split so every pair is nested or disjoint (bold 0-4 with italic 2-6
 * becomes bold 0-4, italic 2-4, italic 4-6); then everything is sorted by offset ascending, length
 * descending and a fixed type order. Merging comes first and splitting last, so the pieces of a split are
 * never merged back, and normalizing a normal form returns it unchanged. What each character looks like is
 * unchanged. Overlaps that involve code, pre, text_link or blockquote are left for `validatePostEntities` to
 * refuse. It does not judge validity: cuts only happen at existing boundaries, so a boundary inside a
 * surrogate pair in the output was in the input and is still caught by validating the result.
 */
export function normalizeEntities(entities: readonly PostEntity[]): PostEntity[] {
  const groups = new Map<string, PostEntity[]>();
  for (const entity of entities) {
    const key = `${entity.type}\u0000${attribute(entity)}`;
    const group = groups.get(key);
    if (group === undefined) groups.set(key, [entity]);
    else group.push(entity);
  }

  const merged: PostEntity[] = [];
  for (const group of groups.values()) {
    const sorted = [...group].sort((a, b) => a.offset - b.offset);
    let current = sorted[0];
    for (const next of sorted.slice(1)) {
      if (current === undefined) break;
      if (next.offset <= endOf(current)) {
        const end = Math.max(endOf(current), endOf(next));
        current = { ...current, length: end - current.offset };
      } else {
        merged.push(current);
        current = next;
      }
    }
    if (current !== undefined) merged.push(current);
  }
  return splitPartialOverlaps(merged);
}

// Telegram's nesting rules for the types we allow. Same-type pairs are the ones the normal form removes
// (styles merge), or Telegram refuses (link in link, code in code, quote in quote).
function canContain(outer: PostEntityType, inner: PostEntityType): boolean {
  switch (outer) {
    case 'code':
    case 'pre':
      return false;
    case 'text_link':
      return inner !== 'text_link' && inner !== 'code' && inner !== 'pre';
    case 'blockquote':
      return inner !== 'blockquote';
    default:
      return true;
  }
}

function splitsSurrogatePair(body: string, boundary: number): boolean {
  if (boundary <= 0 || boundary >= body.length) return false;
  const before = body.charCodeAt(boundary - 1);
  const after = body.charCodeAt(boundary);
  return before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff;
}

/**
 * Checks a list against the body it belongs to; the order of the list does not matter. Returns the first
 * problem or null. It checks: at most 100 entities, every range inside the body and not cutting a
 * surrogate pair, the serialized list within POST_ENTITIES_JSON_MAX, and Telegram's nesting rules: two
 * entities that share characters must be fully nested, and the outer one must be allowed to contain the
 * inner one. bold, italic, underline, strikethrough and spoiler nest freely; code and pre contain nothing
 * and sit only inside those four and blockquote; a blockquote never holds a blockquote; a text_link
 * never holds or sits inside a text_link, code or pre. Run it on the normal form: the size limit and the
 * "same type" cases assume merged entities.
 */
export function validatePostEntities(body: string, entities: readonly PostEntity[]): PostEntityIssue | null {
  if (entities.length > POST_ENTITIES_MAX) return { code: 'ENTITIES_TOO_MANY' };

  for (const [index, entity] of entities.entries()) {
    if (entity.offset + entity.length > body.length) return { code: 'ENTITIES_OUT_OF_RANGE', index };
    if (splitsSurrogatePair(body, entity.offset) || splitsSurrogatePair(body, entity.offset + entity.length)) {
      return { code: 'ENTITIES_SPLIT_SURROGATE', index };
    }
  }

  if (JSON.stringify(entities).length > POST_ENTITIES_JSON_MAX) return { code: 'ENTITIES_TOO_LARGE' };

  for (const [i, a] of entities.entries()) {
    for (const [j, b] of entities.entries()) {
      if (j <= i) continue;
      const aEnd = a.offset + a.length;
      const bEnd = b.offset + b.length;
      if (a.offset >= bEnd || b.offset >= aEnd) continue;
      const aHoldsB = a.offset <= b.offset && bEnd <= aEnd;
      const bHoldsA = b.offset <= a.offset && aEnd <= bEnd;
      if (!aHoldsB && !bHoldsA) return { code: 'ENTITIES_INVALID_NESTING', index: j };
      // Equal ranges nest either way round; any other pair has exactly one possible outer entity.
      const allowed = (aHoldsB && canContain(a.type, b.type)) || (bHoldsA && canContain(b.type, a.type));
      if (!allowed) return { code: 'ENTITIES_INVALID_NESTING', index: j };
    }
  }
  return null;
}

/**
 * Normalizes `entities` and checks them against `body`, reporting a problem as a Zod issue whose message is
 * its code. Returns the normal form; shared by the create and update schemas.
 */
export function normalizeAndCheckEntities(
  body: string,
  entities: readonly PostEntity[],
  ctx: z.RefinementCtx
): PostEntity[] {
  const normalized = normalizeEntities(entities);
  const issue = validatePostEntities(body, normalized);
  if (issue !== null) {
    ctx.addIssue({
      code: 'custom',
      message: issue.code,
      path: issue.index === undefined ? ['entities'] : ['entities', issue.index]
    });
  }
  return normalized;
}
