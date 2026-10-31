import { expandRichMedia, RICH_MEDIA_SLOT } from '@alexeev/contracts';

// How a rubric post's words are laid out for Telegram: links as words, rich HTML for albums.

/**
 * Links as words at the end of a caption (owner, 27.10.2026: «ссылки прятать в текст»): each one's words on its own line
 * and a text_link entity over them; UTF-16 offsets, as Telegram counts.
 */
export function withLinks(
  body: string,
  links: { text: string; url: string }[]
): { text: string; entities: { type: 'text_link'; offset: number; length: number; url: string }[] } {
  let text = body;
  const entities: { type: 'text_link'; offset: number; length: number; url: string }[] = [];
  for (const link of links) {
    text += text === '' ? '' : '\n';
    entities.push({ type: 'text_link', offset: text.length, length: link.text.length, url: link.url });
    text += link.text;
  }
  return { text, entities };
}

const escapeRich = (text: string) =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

/** An album's rich HTML: the media as a carousel (one alone as a figure), each line of the text as a paragraph, the links. */
export function albumRichHtml(
  body: string,
  links: { text: string; url: string }[],
  media: readonly { kind: 'photo' | 'video' | 'animation' }[]
): string {
  return [
    expandRichMedia(RICH_MEDIA_SLOT, media),
    ...body
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map((line) => `<p>${escapeRich(line.trim())}</p>`),
    ...links.map((link) => `<p><a href="${escapeRich(link.url)}">${escapeRich(link.text)}</a></p>`)
  ].join('\n');
}
