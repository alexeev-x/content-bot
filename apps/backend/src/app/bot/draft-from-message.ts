import { type CreatePostInput, createPostInputSchema, POST_BODY_MAX, POST_TITLE_MAX } from '@alexeev/contracts';

export type DraftFromMessage =
  { ok: true; input: CreatePostInput } | { ok: false; reason: 'TOO_LONG' | 'INVALID_TEXT' };

const ELLIPSIS = '…';

// Posts store plain text only (a title and a body, no Telegram entities): bold, links and the rest of
// the message's formatting are not kept until rich text (plan step 3) exists. The text itself is kept
// whole: the first line becomes the title and everything after it the body. A first line longer than the
// title allows is cut at the limit (never between the two halves of an emoji) and the remainder of that
// line stays at the start of the body, so no character is lost.
export function draftFromMessageText(text: string): DraftFromMessage {
  const normalized = text.replace(/\r\n?/g, '\n').trim();
  const newline = normalized.indexOf('\n');
  const firstLine = newline === -1 ? normalized : normalized.slice(0, newline);
  const afterFirstLine = newline === -1 ? '' : normalized.slice(newline + 1);

  // A title may not hold a tab, and runs of blanks mean nothing in a title.
  let title = firstLine.replace(/[\t ]+/g, ' ').trim();
  let body = afterFirstLine.trim();
  if (title.length > POST_TITLE_MAX) {
    // Room for the ellipsis; the cut moves back by one when it would split a surrogate pair.
    let cut = POST_TITLE_MAX - ELLIPSIS.length;
    const last = title.charCodeAt(cut - 1);
    if (last >= 0xd800 && last <= 0xdbff) cut -= 1;
    const rest = title.slice(cut).trim();
    title = `${title.slice(0, cut).trimEnd()}${ELLIPSIS}`;
    body = [rest, body].filter((part) => part !== '').join('\n');
  }
  if (body.length > POST_BODY_MAX) return { ok: false, reason: 'TOO_LONG' };

  // The contract schema is the one authority on what a post may hold (control characters, lone surrogates).
  const parsed = createPostInputSchema.safeParse({ title, body });
  return parsed.success ? { ok: true, input: parsed.data } : { ok: false, reason: 'INVALID_TEXT' };
}
