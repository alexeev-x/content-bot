export type MessageRef = { ok: true; id: string } | { ok: false; reason: 'empty' | 'format' | 'channel' };

const ID = /^[1-9]\d{0,15}$/;
const PUBLIC_NAME = /^[A-Za-z][A-Za-z0-9_]{3,31}$/;
const PRIVATE_CHAT = /^\d{1,13}$/;

/**
 * Pulls the Telegram message id out of what the owner pasted: a bare number, `https://t.me/<name>/<id>` or
 * `t.me/c/<internal>/<id>`. When the destination's chat id is known, a link into another channel is refused:
 * confirming a message from the wrong channel would record a send that never happened here.
 */
export function parseMessageRef(input: string, chatId?: string): MessageRef {
  const text = input.trim();
  if (text === '') return { ok: false, reason: 'empty' };
  if (/^\d+$/.test(text)) return ID.test(text) ? { ok: true, id: text } : { ok: false, reason: 'format' };

  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return { ok: false, reason: 'format' };
  }
  const host = url.hostname.toLowerCase();
  if ((url.protocol !== 'https:' && url.protocol !== 'http:') || (host !== 't.me' && host !== 'telegram.me')) {
    return { ok: false, reason: 'format' };
  }
  const parts = url.pathname.split('/').filter(Boolean);
  const id = parts.at(-1);
  if (id === undefined || !ID.test(id)) return { ok: false, reason: 'format' };

  if (parts.length === 3 && parts[0] === 'c' && PRIVATE_CHAT.test(parts[1] ?? '')) {
    const internal = parts[1];
    const known = chatId === undefined ? null : /^-100(\d{1,13})$/.exec(chatId);
    return known && known[1] !== internal ? { ok: false, reason: 'channel' } : { ok: true, id };
  }
  if (parts.length === 2 && PUBLIC_NAME.test(parts[0] ?? '')) {
    const known = chatId !== undefined && chatId.startsWith('@') ? chatId.slice(1).toLowerCase() : null;
    return known !== null && known !== parts[0]?.toLowerCase() ? { ok: false, reason: 'channel' } : { ok: true, id };
  }
  return { ok: false, reason: 'format' };
}
