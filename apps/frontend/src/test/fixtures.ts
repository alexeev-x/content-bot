import { DEFAULT_SEND_OPTIONS } from '@alexeev/contracts';
import type {
  AccessTokenDto,
  ApiErrorCode,
  DestinationDto,
  MeDto,
  PostDto,
  PostPublicationSummary,
  PublicationDto,
  PublicationStatusCounts,
  TelegramWidgetSignInInput
} from '@alexeev/contracts';

export const ids = {
  post: '11111111-1111-4111-8111-111111111111',
  post2: '11111111-1111-4111-8111-222222222222',
  destination: '22222222-2222-4222-8222-222222222222',
  publication: '33333333-3333-4333-8333-333333333333'
} as const;

const T = '2026-10-06T09:00:00.000Z';

export const accessToken = (token = 'access-1'): AccessTokenDto => ({
  accessToken: token,
  expiresAt: '2026-10-06T10:00:00.000Z'
});

export const me: MeDto = { telegramId: '1000001', name: 'Owner' };

export const widgetUser: TelegramWidgetSignInInput = {
  id: 1000001,
  first_name: 'Owner',
  username: 'owner',
  auth_date: 1_790_000_000,
  hash: 'a'.repeat(64),
  // Extra scalar fields must travel unchanged: the signature covers them.
  language_code: 'ru'
};

export const emptySummary = (overrides: Partial<PostPublicationSummary> = {}): PostPublicationSummary => ({
  counts: {
    scheduled: 0,
    queued: 0,
    preparing: 0,
    sending: 0,
    sent: 0,
    retry_wait: 0,
    failed: 0,
    unknown: 0,
    cancelled: 0
  },
  nextScheduled: null,
  lastSentAt: null,
  destinations: [],
  ...overrides
});

/** A live draft with no publications; archived posts pass `archivedAt` and `autoDeleteAt`. */
export const post = (overrides: Partial<PostDto> = {}): PostDto => ({
  id: ids.post,
  title: 'Заголовок',
  titleInMessage: true,
  body: 'Текст поста',
  entities: [],
  kind: 'text',
  poll: null,
  sendOptions: DEFAULT_SEND_OPTIONS,
  richHtml: null,
  mediaPendingUntil: null,
  revision: 0,
  status: 'draft',
  media: [],
  archivedAt: null,
  autoDeleteAt: null,
  publicationSummary: emptySummary(),
  createdAt: T,
  updatedAt: T,
  ...overrides
});

export const destination = (overrides: Partial<DestinationDto> = {}): DestinationDto => ({
  id: ids.destination,
  title: 'Канал',
  chatId: '-1001234567890',
  kind: 'channel',
  enabled: true,
  revision: 0,
  createdAt: T,
  updatedAt: T,
  ...overrides
});

export const publication = (overrides: Partial<PublicationDto> = {}): PublicationDto => ({
  id: ids.publication,
  postId: ids.post,
  postRevision: 1,
  destinationId: ids.destination,
  status: 'scheduled',
  scheduledAt: '2026-10-07T09:00:00.000Z',
  timezone: 'Europe/Moscow',
  revision: 0,
  createdAt: T,
  updatedAt: T,
  ...overrides
});

export const publicationStatusCounts = (overrides: Partial<PublicationStatusCounts> = {}): PublicationStatusCounts => ({
  scheduled: 0,
  queued: 0,
  preparing: 0,
  sending: 0,
  sent: 0,
  retry_wait: 0,
  failed: 0,
  unknown: 0,
  cancelled: 0,
  ...overrides
});

export const publicationPage = (
  items: PublicationDto[],
  options: { nextCursor?: string | null; totalCount?: number; statusCounts?: Partial<PublicationStatusCounts> } = {}
) => ({
  items,
  nextCursor: options.nextCursor ?? null,
  page: null,
  totalCount: options.totalCount ?? items.length,
  statusCounts: publicationStatusCounts(options.statusCounts)
});

export const ownerOperationsSettings = (
  overrides: {
    timezone?: string;
    notifications?: Partial<{
      warningsEnabled: boolean;
      publicationAlerts: boolean;
      sourceAlerts: boolean;
      automationAlerts: boolean;
      recoveryAlerts: boolean;
      scheduleNotices: boolean;
      sentNotices: boolean;
      dotaWatchlistAlerts: boolean;
      dailyReport: boolean;
      dailyReportHour: number;
    }>;
    revision?: number;
    updatedAt?: string | null;
  } = {}
) => ({
  timezone: overrides.timezone ?? 'Europe/Moscow',
  notifications: {
    warningsEnabled: true,
    publicationAlerts: true,
    sourceAlerts: true,
    automationAlerts: true,
    recoveryAlerts: true,
    scheduleNotices: true,
    sentNotices: true,
    dotaWatchlistAlerts: true,
    dailyReport: false,
    dailyReportHour: 9,
    ...overrides.notifications
  },
  revision: overrides.revision ?? 0,
  updatedAt: overrides.updatedAt ?? null
});

export const errorBody = (code: ApiErrorCode, details?: Record<string, string>) => ({
  error: { code, message: `${code} message`, requestId: 'req-test-1', ...(details ? { details } : {}) }
});

/** A page of posts as GET /posts returns it, with the archive size and filtered result count. */
export const postPage = (
  items: PostDto[],
  options: { nextCursor?: string | null; archivedCount?: number; totalCount?: number } = {}
) => ({
  items,
  nextCursor: options.nextCursor ?? null,
  page: null,
  archivedCount: options.archivedCount ?? 0,
  totalCount: options.totalCount ?? items.length
});

const inHours = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();

/** A post with the given publication counts; `nextScheduled` and `destinations` follow from them. */
export const postWith = (
  counts: Partial<PostPublicationSummary['counts']>,
  overrides: Partial<PostDto> = {}
): PostDto => {
  const waiting = (counts.scheduled ?? 0) + (counts.queued ?? 0) + (counts.retry_wait ?? 0);
  const summary = emptySummary({
    counts: { ...emptySummary().counts, ...counts },
    nextScheduled: waiting > 0 ? { scheduledAt: '2026-10-08T09:00:00.000Z', destinationId: ids.destination } : null,
    destinations: [{ id: ids.destination, title: 'Канал' }]
  });
  return post({ status: 'approved', revision: 2, publicationSummary: summary, ...overrides });
};

/** An archived post that is deleted automatically `days` days from now. */
export const archivedPost = (overrides: Partial<PostDto> = {}, days = 20): PostDto =>
  postWith(
    { sent: 1 },
    {
      archivedAt: '2026-10-05T09:00:00.000Z',
      autoDeleteAt: inHours(days * 24),
      ...overrides,
      publicationSummary: emptySummary({
        counts: { ...emptySummary().counts, sent: 1 },
        lastSentAt: '2026-10-05T09:00:00.000Z',
        destinations: [{ id: ids.destination, title: 'Канал' }]
      })
    }
  );
