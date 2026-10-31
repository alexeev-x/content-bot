import { type PostEntity, validatePostEntities } from '@alexeev/contracts';

// A post becomes one Telegram text message: its trimmed body, never a title line (owner, 31.10.2026). It is sent as
// plain text plus entities, never with a parse_mode, so a stray "<" or "&" in a post is just a character and
// cannot become a "can't parse entities" failure after the send was marked. Entity offsets count UTF-16
// code units, which is what String#length counts and what Telegram uses.
export const TELEGRAM_TEXT_MAX = 4096;

export type FormattedMessage =
  { ok: true; text: string; entities: PostEntity[] } | { ok: false; reason: 'EMPTY' | 'TOO_LONG' | 'ENTITIES_INVALID' };

export function formatPublicationText(post: { body: string; entities: PostEntity[] }): FormattedMessage {
  // Stored entities were checked when written; checking again here keeps a damaged row from reaching
  // Telegram, where it would be refused after the send was marked.
  if (validatePostEntities(post.body, post.entities) !== null) return { ok: false, reason: 'ENTITIES_INVALID' };

  const text = post.body.trim();
  if (text === '') return { ok: false, reason: 'EMPTY' };
  // UTF-16 code units (String#length) never undercount, so a message that passes here fits.
  if (text.length > TELEGRAM_TEXT_MAX) return { ok: false, reason: 'TOO_LONG' };

  const start = post.body.length - post.body.trimStart().length;
  const end = start + text.length;
  const entities: PostEntity[] = [];
  // Trimming removes text from the body's ends, so entities are cut to what is left and moved with it;
  // one that covered only the removed whitespace is dropped.
  for (const entity of post.entities) {
    const from = Math.max(entity.offset, start);
    const to = Math.min(entity.offset + entity.length, end);
    if (to > from) entities.push({ ...entity, offset: from - start, length: to - from });
  }
  return { ok: true, text, entities };
}
