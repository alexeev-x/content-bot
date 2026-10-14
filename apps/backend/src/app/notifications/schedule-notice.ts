import { channelFact, clip, formatOwnerTime, noticeHtml } from './notice-template';

const DETAILS_BUTTON_TEXT = 'Подробнее';

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

// The post's title; a post without one is recognised by the start of its text.
function postLabel(post: ScheduleNoticeInput['post']): string {
  if (post === null) return FALLBACK_TITLE;
  const title = post.title.trim();
  if (title !== '') return clip(title);
  const excerpt = post.body.replace(/\s+/g, ' ').trim();
  return excerpt === '' ? FALLBACK_TITLE : clip(excerpt);
}

export function formatScheduleNotice(input: ScheduleNoticeInput): ScheduleNotice {
  const when = formatOwnerTime(input.scheduledAt, input.timezone);
  const scheduled = input.kind === 'scheduled';
  return {
    html: noticeHtml({
      tone: scheduled ? 'scheduled' : 'rescheduled',
      status: scheduled ? 'Публикация запланирована' : 'Публикация перенесена',
      subject: postLabel(input.post),
      facts: [
        channelFact(input.channelTitle ?? FALLBACK_TITLE),
        { icon: '🕒', text: scheduled ? when : `Новое время: ${when}` }
      ]
    }),
    button: { text: DETAILS_BUTTON_TEXT, url: `${input.appOrigin}/publications?id=${input.publicationId}` }
  };
}
