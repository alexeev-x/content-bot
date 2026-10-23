import { z } from 'zod';

// A rich post (owner, 23.10.2026: every post goes out in the approved rich format): Telegram's rich HTML (Bot API 10.1,
// `sendRichMessage`). The post's own media are named in it by position as `tg://photo?id=p1`, `tg://video?id=p2`…; a
// picture from a source CDN may be named by its https URL. `body` keeps the plain text for the studio.

/** Telegram's cap on a rich message's text (Bot API «Rich Message Limits», 23.10.2026). */
export const RICH_HTML_MAX = 32768;
/** Telegram's cap on media in one rich message. */
export const RICH_MEDIA_MAX = 50;

/** The id the post's media item at `index` (0-based) has in its rich HTML. */
export const richMediaId = (index: number) => `p${index + 1}`;

const MEDIA_REFERENCE = /tg:\/\/(?:photo|video)\?id=p(\d{1,2})\b/g;

export const postRichHtmlSchema = z.string().min(1).max(RICH_HTML_MAX);

/**
 * Where the post's attached media go, written by the server's writers (owner, 23.10.2026: one picture per post, several
 * in one slider). The media are attached after the text (a patch picture is drawn after approval), so the slot is
 * filled at sending from the approved snapshot: one picture, a slider of several, or nothing.
 */
export const RICH_MEDIA_SLOT = '{{media}}';

/** The rich HTML as it goes out: the media slot filled with the post's `media` (their kinds, in order). */
export function expandRichMedia(html: string, media: readonly { kind: 'photo' | 'video' | 'animation' }[]): string {
  if (!html.includes(RICH_MEDIA_SLOT)) return html;
  const items = media.map((item, index) =>
    item.kind === 'photo'
      ? `<img src="tg://photo?id=${richMediaId(index)}"/>`
      : `<video src="tg://video?id=${richMediaId(index)}"/>`
  );
  const block =
    items.length === 0
      ? ''
      : items.length === 1
        ? `<figure>${items[0]}</figure>`
        : `<tg-slideshow>${items.join('')}</tg-slideshow>`;
  return html.split(RICH_MEDIA_SLOT).join(block);
}

/** The 0-based positions of the post's media the rich HTML names, ascending; only these are uploaded. */
export function richMediaPositions(html: string): number[] {
  const positions = new Set<number>();
  for (const match of html.matchAll(MEDIA_REFERENCE)) positions.add(Number(match[1]) - 1);
  return [...positions].filter((position) => position >= 0).sort((a, b) => a - b);
}

export type RichHtmlIssue = 'EMPTY' | 'TOO_LONG' | 'MARK_FORBIDDEN' | 'MEDIA_MISSING';

/**
 * Why the rich HTML cannot go out with `mediaCount` attached media, or null. `<mark>` is refused: on a phone in the dark
 * theme it is white text on yellow (owner, 23.10.2026). Telegram itself checks the rest of the markup; its refusal is a
 * definite 400, never an ambiguous send.
 */
export function richHtmlIssue(html: string, mediaCount: number): RichHtmlIssue | null {
  if (html.trim() === '') return 'EMPTY';
  if (html.length > RICH_HTML_MAX) return 'TOO_LONG';
  if (/<mark[\s>]/i.test(html)) return 'MARK_FORBIDDEN';
  for (const match of html.matchAll(MEDIA_REFERENCE)) {
    const position = Number(match[1]);
    if (position < 1 || position > mediaCount) return 'MEDIA_MISSING';
  }
  return null;
}
