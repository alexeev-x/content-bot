import type {
  AccessTokenDto,
  ApiErrorCode,
  DestinationDto,
  MeDto,
  PostDto,
  PublicationDto,
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

export const post = (overrides: Partial<PostDto> = {}): PostDto => ({
  id: ids.post,
  title: 'Заголовок',
  body: 'Текст поста',
  revision: 0,
  status: 'draft',
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

export const errorBody = (code: ApiErrorCode, details?: Record<string, string>) => ({
  error: { code, message: `${code} message`, requestId: 'req-test-1', ...(details ? { details } : {}) }
});
