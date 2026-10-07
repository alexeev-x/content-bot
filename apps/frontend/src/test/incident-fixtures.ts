import type { IncidentDto, IncidentPageDto } from '@alexeev/contracts';

export const uuid = (n: number): string => `55555555-5555-4555-8555-${String(n).padStart(12, '0')}`;
export const PUBLICATION = '33333333-3333-4333-8333-000000000009';
export const JOB = '66666666-6666-4666-8666-000000000001';

export const failedIncident = (overrides: Partial<IncidentDto> = {}): IncidentDto => ({
  id: uuid(1),
  kind: 'publish_failed',
  code: 'DESTINATION_UNAVAILABLE',
  occurredAt: '2026-10-07T11:30:00.000Z',
  jobId: JOB,
  attemptCount: 3,
  publication: {
    id: PUBLICATION,
    status: 'failed',
    postTitle: 'Герой дня',
    destinationName: 'Dota Studio',
    scheduledAt: '2026-10-07T11:00:00.000Z'
  },
  ...overrides
});

export const unknownIncident = (overrides: Partial<IncidentDto> = {}): IncidentDto =>
  failedIncident({
    id: uuid(2),
    kind: 'publish_unknown',
    code: 'SEND_UNCONFIRMED',
    attemptCount: 1,
    publication: {
      id: '33333333-3333-4333-8333-000000000008',
      status: 'unknown',
      postTitle: 'Итоги недели',
      destinationName: 'Dota Studio',
      scheduledAt: '2026-10-07T10:00:00.000Z'
    },
    ...overrides
  });

export const incidentPage = (
  items: IncidentDto[],
  options: { nextCursor?: string | null; openCount?: number } = {}
): IncidentPageDto => ({
  items,
  nextCursor: options.nextCursor ?? null,
  openCount: options.openCount ?? items.filter((item) => item.resolvedAt === undefined).length
});
