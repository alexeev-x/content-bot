import type { InlineKeyboardMarkup } from 'grammy/types';
import { buildMessagePreviews } from '../../modules/content-analytics';
import type { OwnerIncidentAlertGroup } from '../../modules/publishing';
import {
  CHANGED_TEXT,
  DRAFT_CREATED_TEXT,
  DRAFT_FAILED_TEXT,
  DRAFT_INVALID_TEXT,
  DRAFT_TOO_LONG_TEXT,
  DUPLICATE_TEXT,
  EXPIRED_TEXT,
  IMPORTING_TEXT,
  MEDIA_DRAFT_CREATED_TEXT,
  REPORT_FAILED_TEXT,
  START_TEXT,
  STATUS_LABEL,
  UNSUPPORTED_TEXT
} from '../bot/create-bot';
import { importReportText } from '../bot/media-import-worker';
import { createOwnerReports, type OwnerReportDeps } from '../bot/owner-reports';
import { publishKeyboard } from '../bot/publish-keyboard';
import { formatDotaDraftAlert, formatDotaIncidentAlert, formatDotaWatchlistAlert } from './dota-alert';
import { formatOwnerIncidentOccurrence, formatOwnerIncidentRecovery } from './incident-alert';
import { escapeHtml } from './notice-template';
import { formatScheduleNotice } from './schedule-notice';
import { formatSentNotice } from './sent-notice';

// Every message the backend sends the owner's chat, built by the same formatters the real senders use, so
// the owner sees exactly what arrives (Настройки → Аналитика → «Прислать примеры в бота»). Samples stand in
// for posts and channels; the bot reports and the weekly digest use the real data. Channel posts are not
// here: they are the owner's own text.

export interface CatalogMessage {
  html: string;
  markup: InlineKeyboardMarkup;
}

export interface CatalogSection {
  heading: string;
  messages: CatalogMessage[];
}

const SAMPLE_POST = 'Патч 7.38: что поменялось у Пуджа';
const SAMPLE_CHANNEL = 'ALEXEEV | Dota 2';
const SAMPLE_ID = '00000000-0000-4000-8000-000000000000';
const HOUR_MS = 60 * 60 * 1000;

const webApp = (text: string, url: string): InlineKeyboardMarkup => ({
  inline_keyboard: [[{ text, web_app: { url } }]]
});

function withButton(message: { html: string; button: { text: string; url: string } }): CatalogMessage {
  return { html: message.html, markup: webApp(message.button.text, message.button.url) };
}

/** Plain bot answers in one message: each is a single line, sent or shown as a pop-up on its own. */
function shortReplies(): string {
  const line = (text: string) => `• ${escapeHtml(text)}`;
  return [
    '<b>Короткие ответы бота</b> <i>(каждый приходит отдельным сообщением)</i>',
    '',
    line(START_TEXT),
    line(DRAFT_CREATED_TEXT),
    line(MEDIA_DRAFT_CREATED_TEXT),
    line(DRAFT_TOO_LONG_TEXT),
    line(DRAFT_INVALID_TEXT),
    line(DRAFT_FAILED_TEXT),
    line(UNSUPPORTED_TEXT),
    line(REPORT_FAILED_TEXT),
    '',
    '<b>После нажатия «Опубликовать сейчас»</b> <i>(текст заменяет сообщение)</i>',
    '',
    line(`${STATUS_LABEL.queued}: ${SAMPLE_CHANNEL}`),
    line(`${STATUS_LABEL.sent}: ${SAMPLE_CHANNEL}`),
    line(`${STATUS_LABEL.failed}: ${SAMPLE_CHANNEL}`),
    line(`${STATUS_LABEL.unknown}: ${SAMPLE_CHANNEL}`),
    line(CHANGED_TEXT),
    line(IMPORTING_TEXT),
    line(DUPLICATE_TEXT),
    line(EXPIRED_TEXT)
  ].join('\n');
}

/** Bounded: the three reports' reads (a few rows each) and the digest's four reads; about 40 messages. */
export async function buildMessageCatalog(deps: {
  appOrigin: string;
  timezone: string;
  reports: Omit<OwnerReportDeps, 'appOrigin' | 'ownerTimezone'>;
  analytics: Parameters<typeof buildMessagePreviews>[0];
}): Promise<CatalogSection[]> {
  const { appOrigin, timezone } = deps;
  const now = deps.reports.clock.now();
  const reports = createOwnerReports({ ...deps.reports, appOrigin, ownerTimezone: () => Promise.resolve(timezone) });
  const schedule = (kind: 'scheduled' | 'rescheduled' | 'cancelled') =>
    withButton(
      formatScheduleNotice({
        kind,
        post: { title: SAMPLE_POST, body: '' },
        channelTitle: SAMPLE_CHANNEL,
        scheduledAt: now + 3 * HOUR_MS,
        timezone,
        publicationId: SAMPLE_ID,
        appOrigin
      })
    );
  const incident = (input: Partial<OwnerIncidentAlertGroup>): OwnerIncidentAlertGroup => ({
    groupKey: 'preview',
    kind: 'publish_failed',
    code: 'DESTINATION_UNAVAILABLE',
    publicationId: SAMPLE_ID,
    postTitle: SAMPLE_POST,
    channelTitle: SAMPLE_CHANNEL,
    firstSeenAt: now - 2 * HOUR_MS,
    lastSeenAt: now,
    occurrenceCount: 1,
    recovery: false,
    recoveredAt: null,
    ...input
  });
  const sent = formatSentNotice(
    {
      publicationId: SAMPLE_ID,
      postTitle: SAMPLE_POST,
      channelTitle: SAMPLE_CHANNEL,
      chatId: '@alexeev_x',
      externalMessageId: '512'
    },
    appOrigin
  );
  // No «Опубликовать сейчас» buttons: a sample must never ask for a real publication.
  const draftMarkup = publishKeyboard({ appOrigin, postId: SAMPLE_ID, buttons: [] }) ?? { inline_keyboard: [] };
  const dotaIncident = { id: 'preview', sourceKey: 'steam_news', externalId: null, code: 'DOTA_SOURCE_FETCH' } as const;

  const [today, next, status, analytics] = await Promise.all([
    reports.today(),
    reports.next(),
    reports.status(),
    buildMessagePreviews(deps.analytics)
  ]);

  return [
    {
      heading: '📅 Публикации',
      messages: [
        schedule('scheduled'),
        schedule('rescheduled'),
        schedule('cancelled'),
        { html: sent.html, markup: sent.markup },
        withButton(formatOwnerIncidentOccurrence(incident({}), appOrigin, timezone)),
        withButton(
          formatOwnerIncidentOccurrence(
            incident({ kind: 'publish_unknown', code: 'TELEGRAM_RESULT_UNKNOWN' }),
            appOrigin,
            timezone
          )
        ),
        withButton(formatOwnerIncidentOccurrence(incident({ occurrenceCount: 3 }), appOrigin, timezone)),
        withButton(formatOwnerIncidentRecovery(incident({ recovery: true, recoveredAt: now }), appOrigin))
      ]
    },
    {
      heading: '🤖 Ответы бота на команды (с настоящими данными)',
      messages: [
        withButton(today),
        withButton(next),
        withButton(status),
        { html: escapeHtml(DRAFT_CREATED_TEXT), markup: draftMarkup },
        {
          html: escapeHtml(
            importReportText({ done: 2, captionTooLong: false, failed: [{ kind: 'video', failure: 'too_large' }] })
          ),
          markup: draftMarkup
        },
        { html: shortReplies(), markup: webApp('Открыть студию', `${appOrigin}/`) }
      ]
    },
    {
      heading: '🎮 Dota',
      messages: [
        { html: formatDotaDraftAlert({ eventType: 'patch', title: 'Gameplay Update 7.38' }), markup: draftMarkup },
        {
          html: formatDotaDraftAlert({ eventType: 'treasure', title: 'Сокровищница Crownfall' }),
          markup: draftMarkup
        },
        withButton(formatDotaIncidentAlert({ ...dotaIncident, resolvedAt: null }, appOrigin)),
        withButton(formatDotaIncidentAlert({ ...dotaIncident, resolvedAt: now }, appOrigin)),
        {
          html: formatDotaWatchlistAlert({ entityType: 'hero', entityName: 'Pudge', title: 'Gameplay Update 7.38' }),
          markup: webApp('Открыть обновление', `${appOrigin}/sources`)
        }
      ]
    },
    {
      heading: '📊 Аналитика: каждый вид в нескольких стилях — выберите стиль',
      messages: analytics.map((message) => ({
        html: message.html,
        markup: {
          inline_keyboard: [
            ...(message.buttons ?? []).map((button) => [
              { text: button.text, web_app: { url: new URL(button.linkPath, appOrigin).toString() } }
            ]),
            [
              {
                text: message.kind === 'source' ? 'Открыть и обновить' : 'Открыть аналитику',
                web_app: { url: new URL(message.linkPath, appOrigin).toString() }
              }
            ]
          ]
        }
      }))
    }
  ];
}
