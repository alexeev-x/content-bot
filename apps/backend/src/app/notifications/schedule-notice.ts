// Telegram HTML only needs these four escaped. Kept here: `app/` may reach a module only through its index.
export function escapeHtml(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

const DETAILS_BUTTON_TEXT = 'Подробнее';

const MAX_TITLE_CHARS = 100;
const FALLBACK_TITLE = 'Без названия';

export interface ScheduleNoticeInput {
  kind: 'scheduled' | 'rescheduled';
  post: { title: string; body: string } | null;
  channelTitle: string | null;
  /** UTC epoch milliseconds. */
  scheduledAt: number;
  /** IANA zone the owner scheduled in. */
  timezone: string;
  publicationId: string;
  appOrigin: string;
}

export interface ScheduleNotice {
  /** Telegram HTML: every user-controlled part is escaped. */
  html: string;
  button: { text: string; url: string };
}

export function clip(text: string): string {
  const chars = Array.from(text);
  return chars.length > MAX_TITLE_CHARS ? `${chars.slice(0, MAX_TITLE_CHARS).join('').trimEnd()}…` : text;
}

// The post's title; a post without one is recognised by the start of its text.
function postLabel(post: ScheduleNoticeInput['post']): string {
  if (post === null) return FALLBACK_TITLE;
  const title = post.title.trim();
  if (title !== '') return clip(title);
  const excerpt = post.body.replace(/\s+/g, ' ').trim();
  return excerpt === '' ? FALLBACK_TITLE : clip(excerpt);
}

// "17 октября 2026 г., 14:30 (Europe/Moscow)" in the zone the owner scheduled in. Date and time are
// formatted apart because ICU versions differ in the word that joins them. A zone the runtime does
// not know falls back to UTC and says so, so the time is never shown in the wrong zone silently.
function formatScheduledTime(epochMs: number, timezone: string): string {
  const render = (zone: string) => {
    const date = new Intl.DateTimeFormat('ru-RU', { timeZone: zone, day: 'numeric', month: 'long', year: 'numeric' });
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

export function formatScheduleNotice(input: ScheduleNoticeInput): ScheduleNotice {
  const when = escapeHtml(formatScheduledTime(input.scheduledAt, input.timezone));
  const lines = [
    input.kind === 'scheduled' ? '<b>Публикация запланирована</b>' : '<b>Публикация перенесена</b>',
    `Пост: ${escapeHtml(postLabel(input.post))}`,
    `Канал: ${escapeHtml(input.channelTitle === null ? FALLBACK_TITLE : clip(input.channelTitle.trim() || FALLBACK_TITLE))}`,
    input.kind === 'scheduled' ? `Время: ${when}` : `Перенесена на: ${when}`
  ];
  return {
    html: lines.join('\n'),
    button: { text: DETAILS_BUTTON_TEXT, url: `${input.appOrigin}/publications?id=${input.publicationId}` }
  };
}
