// A post becomes one Telegram text message: the title in bold, a blank line, the body. Sent with
// parse_mode HTML, so every user character is escaped; the entities stay machine-made and a
// stray "<" in a post cannot become a "can't parse entities" failure after the send was marked.
export const TELEGRAM_TEXT_MAX = 4096;

export type FormattedMessage = { ok: true; html: string } | { ok: false; reason: 'EMPTY' | 'TOO_LONG' };

export function escapeHtml(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

export function formatPublicationText(post: { title: string; body: string }): FormattedMessage {
  const title = post.title.trim();
  const body = post.body.trim();
  // Telegram counts the text after entity parsing: the plain parts joined by the blank line.
  // UTF-16 code units (String#length) never undercount, so a message that passes here fits.
  const plain = [title, body].filter((part) => part !== '').join('\n\n');
  if (plain === '') return { ok: false, reason: 'EMPTY' };
  if (plain.length > TELEGRAM_TEXT_MAX) return { ok: false, reason: 'TOO_LONG' };
  const parts = [title === '' ? '' : `<b>${escapeHtml(title)}</b>`, escapeHtml(body)].filter((part) => part !== '');
  return { ok: true, html: parts.join('\n\n') };
}
