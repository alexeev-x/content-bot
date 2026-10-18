const MAX_TITLE_CHARS = 100;

// Telegram HTML only needs these four escaped. Kept in `app/`: it may reach a module only through its index.
export function escapeHtml(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

export function clip(text: string): string {
  const chars = Array.from(text);
  return chars.length > MAX_TITLE_CHARS ? `${chars.slice(0, MAX_TITLE_CHARS).join('').trimEnd()}…` : text;
}

// One look for every message the bot sends the owner: a status line with an icon, the post title, then
// labelled facts. Telegram HTML; every user-controlled part is escaped here, never by the callers.

export type NoticeTone =
  'scheduled' | 'rescheduled' | 'cancelled' | 'sent' | 'failed' | 'unknown' | 'recovered' | 'warning' | 'repeat';

const ICON: Record<NoticeTone, string> = {
  scheduled: '🗓',
  rescheduled: '🔁',
  cancelled: '🚫',
  sent: '✅',
  failed: '❌',
  unknown: '⚠️',
  recovered: '✅',
  warning: '⚠️',
  repeat: '🔂'
};

export type NoticeFact = { icon: string; text: string };

export function noticeHtml(input: {
  tone: NoticeTone;
  status: string;
  /** The post (or source) the message is about; shown bold on its own line. */
  subject?: string | null;
  facts?: readonly (NoticeFact | null)[];
  /** A closing sentence: what it means or what to do. */
  note?: string;
}): string {
  const lines = [`${ICON[input.tone]} <b>${escapeHtml(input.status)}</b>`];
  const subject = input.subject?.trim() ?? '';
  // A blank line after the status (owner, 18.10.2026: the post's name stuck to it looked unspaced).
  if (subject !== '') lines.push('', `<b>${escapeHtml(clip(subject))}</b>`);
  const facts = (input.facts ?? []).filter((fact): fact is NoticeFact => fact !== null && fact.text.trim() !== '');
  if (facts.length > 0) {
    lines.push('');
    for (const fact of facts) lines.push(`${fact.icon} ${escapeHtml(clip(fact.text.trim()))}`);
  }
  if (input.note) lines.push('', `<i>${escapeHtml(input.note)}</i>`);
  return lines.join('\n');
}

export const channelFact = (title: string | null | undefined): NoticeFact | null =>
  title && title.trim() !== '' ? { icon: '📣', text: title } : null;

/**
 * «18 октября, 13:45 (Europe/Chisinau)» in the owner's zone; the year only when it is not the current one. A zone
 * the runtime does not know falls back to UTC and says so, so a time is never shown in the wrong zone silently.
 */
export function formatOwnerTime(epochMs: number, timezone: string, now: number = Date.now()): string {
  const render = (zone: string) => {
    const sameYear =
      new Intl.DateTimeFormat('ru-RU', { timeZone: zone, year: 'numeric' }).format(epochMs) ===
      new Intl.DateTimeFormat('ru-RU', { timeZone: zone, year: 'numeric' }).format(now);
    const date = new Intl.DateTimeFormat('ru-RU', {
      timeZone: zone,
      day: 'numeric',
      month: 'long',
      ...(sameYear ? {} : { year: 'numeric' })
    });
    const time = new Intl.DateTimeFormat('ru-RU', {
      timeZone: zone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    });
    return `${date.format(epochMs)}, ${time.format(epochMs)} (${zone})`;
  };
  try {
    return render(timezone);
  } catch {
    return render('UTC');
  }
}

/** `https://t.me/...` for a public `@username` or a private `-100…` channel; null when the id cannot be linked. */
export function telegramMessageUrl(chatId: string | null, messageId: string | null): string | null {
  if (chatId === null || messageId === null || !/^\d{1,12}$/.test(messageId)) return null;
  if (/^@[A-Za-z][A-Za-z0-9_]{4,31}$/.test(chatId)) return `https://t.me/${chatId.slice(1)}/${messageId}`;
  const privateChat = /^-100(\d{1,13})$/.exec(chatId);
  return privateChat ? `https://t.me/c/${privateChat[1]}/${messageId}` : null;
}

/** «1 раз», «3 раза», «5 раз». */
export function timesRu(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  const word = mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? 'раза' : 'раз';
  return `${n} ${word}`;
}
