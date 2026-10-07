import type {
  DashboardAttentionDto,
  DashboardDto,
  DashboardPublicationDto,
  DashboardSentDto
} from '@alexeev/contracts';

export const dash = {
  pubUnknown: '33333333-3333-4333-8333-000000000001',
  pubFailed: '33333333-3333-4333-8333-000000000002',
  pubStuck: '33333333-3333-4333-8333-000000000003',
  pubSent: '33333333-3333-4333-8333-000000000004',
  pubLater: '33333333-3333-4333-8333-000000000005',
  incUnknown: '44444444-4444-4444-8444-000000000001',
  incFailed: '44444444-4444-4444-8444-000000000002'
} as const;

// Owner zone Europe/Chisinau (UTC+3 in October): 06:00Z is 09:00, 15:00Z is 18:00.
export const GENERATED_AT = '2026-10-07T07:00:00.000Z';

export const todayRow = (overrides: Partial<DashboardPublicationDto> = {}): DashboardPublicationDto => ({
  publicationId: dash.pubLater,
  scheduledAt: '2026-10-07T15:00:00.000Z',
  status: 'scheduled',
  postTitle: 'Вечерний разбор',
  destinationName: 'Dota Studio',
  ...overrides
});

export const sentRow = (overrides: Partial<DashboardSentDto> = {}): DashboardSentDto => ({
  publicationId: dash.pubSent,
  scheduledAt: '2026-10-07T06:00:00.000Z',
  status: 'sent',
  postTitle: 'Утренние новости',
  destinationName: 'Dota Studio',
  sentAt: '2026-10-07T06:00:05.000Z',
  ...overrides
});

export const unknownAttention = (overrides: Partial<DashboardAttentionDto> = {}): DashboardAttentionDto => ({
  kind: 'unknown',
  publicationId: dash.pubUnknown,
  incidentId: dash.incUnknown,
  code: 'SEND_UNCONFIRMED',
  postTitle: 'Итоги недели',
  destinationName: 'Dota Studio',
  scheduledAt: '2026-10-07T05:00:00.000Z',
  occurredAt: '2026-10-07T05:00:30.000Z',
  ...overrides
});

export const dashboard = (overrides: Partial<DashboardDto> = {}): DashboardDto => ({
  attention: [],
  attentionTotal: 0,
  today: [],
  todayTotal: 0,
  upcoming: [],
  recentSent: [],
  generatedAt: GENERATED_AT,
  ...overrides
});
