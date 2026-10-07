import type { IncidentDto } from '@alexeev/contracts';
import { projectPublicationStatus } from '../domain/status-projection';
import type { IncidentRecord } from './ports';

export function toIncidentDto(record: IncidentRecord, now: number): IncidentDto {
  return {
    id: record.id,
    kind: record.kind,
    code: record.code,
    occurredAt: new Date(record.createdAt).toISOString(),
    ...(record.resolvedAt === null ? {} : { resolvedAt: new Date(record.resolvedAt).toISOString() }),
    ...(record.jobId === null ? {} : { jobId: record.jobId }),
    attemptCount: record.attemptCount,
    ...(record.publication === null
      ? {}
      : {
          publication: {
            id: record.publication.id,
            status: projectPublicationStatus(record.publication.job, now),
            postTitle: record.publication.postTitle,
            destinationName: record.publication.destinationName,
            scheduledAt: new Date(record.publication.scheduledAt).toISOString()
          }
        })
  };
}
