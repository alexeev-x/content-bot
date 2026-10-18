import { channelFact, clip, formatOwnerTime, noticeHtml } from './notice-template';

const DETAILS_BUTTON_TEXT = 'Подробнее';

const FALLBACK_TITLE = 'Без названия';

export interface ScheduleNoticeInput {
  kind: 'scheduled' | 'rescheduled' | 'cancelled';
  post: { title: string; body: string; kind?: 'text' | 'poll' } | null;
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

// The post's title; a post without one is recognised by the start of its text.
function postLabel(post: ScheduleNoticeInput['post']): string {
  if (post === null) return FALLBACK_TITLE;
  const title = post.title.trim();
  // A poll has no body; its title is the question's start.
  if (post.kind === 'poll') return clip(`📊 ${title === '' ? FALLBACK_TITLE : title}`);
  if (title !== '') return clip(title);
  const excerpt = post.body.replace(/\s+/g, ' ').trim();
  return excerpt === '' ? FALLBACK_TITLE : clip(excerpt);
}

export function formatScheduleNotice(input: ScheduleNoticeInput): ScheduleNotice {
  const when = formatOwnerTime(input.scheduledAt, input.timezone);
  const status = {
    scheduled: 'Публикация запланирована',
    rescheduled: 'Публикация перенесена',
    cancelled: 'Публикация отменена'
  };
  const time = { scheduled: when, rescheduled: `Новое время: ${when}`, cancelled: `Была запланирована на ${when}` };
  return {
    html: noticeHtml({
      tone: input.kind,
      status: status[input.kind],
      subject: postLabel(input.post),
      facts: [channelFact(input.channelTitle ?? FALLBACK_TITLE), { icon: '🕒', text: time[input.kind] }],
      ...(input.kind === 'cancelled' ? { note: 'Сообщение не уйдёт в канал.' } : {})
    }),
    button: { text: DETAILS_BUTTON_TEXT, url: `${input.appOrigin}/publications?id=${input.publicationId}` }
  };
}
