import { type PostEntity, validatePostEntities } from '@alexeev/contracts';

// A post becomes one Telegram text message: the title in bold, a blank line, the body. It is sent as plain
// text plus entities, never with a parse_mode, so a stray "<" or "&" in a post is just a character and
// cannot become a "can't parse entities" failure after the send was marked. Entity offsets count UTF-16
// code units, which is what String#length counts and what Telegram uses.
export const TELEGRAM_TEXT_MAX = 4096;

export type FormattedMessage =
  { ok: true; text: string; entities: PostEntity[] } | { ok: false; reason: 'EMPTY' | 'TOO_LONG' | 'ENTITIES_INVALID' };

const TITLE_SEPARATOR = '\n\n';

export function formatPublicationText(post: { title: string; body: string; entities: PostEntity[] }): FormattedMessage {
  // Stored entities were checked when written; checking again here keeps a damaged row from reaching
  // Telegram, where it would be refused after the send was marked.
  if (validatePostEntities(post.body, post.entities) !== null) return { ok: false, reason: 'ENTITIES_INVALID' };

  const title = post.title.trim();
  const body = post.body.trim();
  // Telegram counts the text after entity parsing: the plain parts joined by the blank line.
  // UTF-16 code units (String#length) never undercount, so a message that passes here fits.
  const text = [title, body].filter((part) => part !== '').join(TITLE_SEPARATOR);
  if (text === '') return { ok: false, reason: 'EMPTY' };
  if (text.length > TELEGRAM_TEXT_MAX) return { ok: false, reason: 'TOO_LONG' };

  const entities: PostEntity[] = title === '' ? [] : [{ type: 'bold', offset: 0, length: title.length }];
  if (body !== '') {
    const start = post.body.length - post.body.trimStart().length;
    const end = start + body.length;
    const shift = title === '' ? 0 : title.length + TITLE_SEPARATOR.length;
    // Trimming removes text from the body's ends, so entities are cut to what is left and moved with it;
    // one that covered only the removed whitespace is dropped.
    for (const entity of post.entities) {
      const from = Math.max(entity.offset, start);
      const to = Math.min(entity.offset + entity.length, end);
      if (to > from) entities.push({ ...entity, offset: from - start + shift, length: to - from });
    }
  }
  return { ok: true, text, entities };
}
