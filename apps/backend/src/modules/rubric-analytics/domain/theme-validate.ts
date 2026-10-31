import { z } from 'zod';
import { COMMENT_KINDS, type CommentKind } from '../constants';

// The model's comment themes checked by code (area-backend-analytics.md §8.4): an id must be one that was sent for
// that post; counts are the valid distinct ids, never a number from the model; a topic label is short plain text; the
// quote is the comment's own text copied by code. Labels are untrusted: stored, escaped on render, never prompted.

const answerSchema = z.object({
  posts: z
    .array(
      z.object({
        post: z.number().int(),
        kinds: z.array(z.object({ kind: z.string(), ids: z.array(z.number().int()) })).max(20),
        topics: z.array(z.object({ label: z.string(), ids: z.array(z.number().int()) })).max(10),
        quote_id: z.number().int().nullable()
      })
    )
    .max(200)
});

const LABEL = /^[\p{L}\p{N} .,!?«»—-]{2,40}$/u;
const QUOTE_MAX = 120;

export interface ValidThemes {
  kinds: Record<CommentKind, number>;
  topics: { label: string; count: number }[];
  quote: string | null;
}

const unsafe = (text: string) => /https?:|www\.|t\.me|@|<|&|\d{7,}/i.test(text);

export function cutQuote(text: string): string | null {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length === 0 || unsafe(clean)) return null;
  if (clean.length <= QUOTE_MAX) return clean;
  const cut = clean.slice(0, QUOTE_MAX - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > 40 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** Per post index: its valid themes. Anything malformed is null (the run fails as AI_BAD_FORMAT, nothing written). */
export function validateThemes(
  answer: unknown,
  sent: readonly { i: number; post: number; t: string }[]
): Map<number, ValidThemes> | null {
  const parsed = answerSchema.safeParse(answer);
  if (!parsed.success) return null;
  const owner = new Map(sent.map((comment) => [comment.i, comment]));
  const out = new Map<number, ValidThemes>();
  for (const post of parsed.data.posts) {
    if (out.has(post.post) || !sent.some((comment) => comment.post === post.post)) continue;
    const valid = (ids: number[]) => [...new Set(ids)].filter((id) => owner.get(id)?.post === post.post);
    const kinds = Object.fromEntries(COMMENT_KINDS.map((kind) => [kind, 0])) as Record<CommentKind, number>;
    const counted = new Set<number>();
    for (const entry of post.kinds) {
      if (!(COMMENT_KINDS as readonly string[]).includes(entry.kind)) continue;
      // One comment, one kind: a second claim of an id is ignored.
      const ids = valid(entry.ids).filter((id) => !counted.has(id));
      ids.forEach((id) => counted.add(id));
      kinds[entry.kind as CommentKind] += ids.length;
    }
    const topics = post.topics
      .map((topic) => ({ label: topic.label.trim(), count: valid(topic.ids).length }))
      .filter((topic) => LABEL.test(topic.label) && !unsafe(topic.label) && topic.count >= 2)
      .slice(0, 3);
    const quoted = post.quote_id === null ? undefined : owner.get(post.quote_id);
    out.set(post.post, {
      kinds,
      topics,
      quote: quoted === undefined || quoted.post !== post.post ? null : cutQuote(quoted.t)
    });
  }
  return out;
}
