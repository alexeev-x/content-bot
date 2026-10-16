import { type PostDto, POST_SUMMARY_DESTINATIONS_MAX, type PublicationStatus } from '@alexeev/contracts';
import { ARCHIVE_RETENTION_MS } from '../../../shared/archive-retention';
import type { PostPublicationSummary, PostRecord } from './ports';

const iso = (at: number): string => new Date(at).toISOString();

const STATUSES: readonly PublicationStatus[] = [
  'scheduled',
  'queued',
  'preparing',
  'sending',
  'sent',
  'retry_wait',
  'failed',
  'unknown',
  'cancelled'
];

export function emptySummary(): PostPublicationSummary {
  return {
    counts: Object.fromEntries(STATUSES.map((status) => [status, 0])) as Record<PublicationStatus, number>,
    nextScheduled: null,
    lastSentAt: null,
    destinations: []
  };
}

// A post without publications (every draft, and every approved post nobody scheduled) has the empty summary.
export function toPostDto(record: PostRecord, summary: PostPublicationSummary = emptySummary()): PostDto {
  return {
    id: record.id,
    title: record.title,
    titleInMessage: record.titleInMessage,
    body: record.body,
    entities: record.entities,
    revision: record.revision,
    status: record.status,
    media: record.media ?? [],
    archivedAt: record.archivedAt === null ? null : iso(record.archivedAt),
    autoDeleteAt: record.archivedAt === null ? null : iso(record.archivedAt + ARCHIVE_RETENTION_MS),
    publicationSummary: {
      counts: summary.counts,
      nextScheduled:
        summary.nextScheduled === null
          ? null
          : { scheduledAt: iso(summary.nextScheduled.scheduledAt), destinationId: summary.nextScheduled.destinationId },
      lastSentAt: summary.lastSentAt === null ? null : iso(summary.lastSentAt),
      destinations: summary.destinations.slice(0, POST_SUMMARY_DESTINATIONS_MAX)
    },
    createdAt: iso(record.createdAt),
    updatedAt: iso(record.updatedAt)
  };
}
