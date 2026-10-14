import type { PublicationDto } from '@alexeev/contracts';
import { projectPublicationStatus } from '../domain/status-projection';
import type { PublicationRecord } from './ports';

export function toPublicationDto(record: PublicationRecord, now: number): PublicationDto {
  return {
    id: record.id,
    postId: record.postId,
    postRevision: record.postRevision,
    destinationId: record.destinationId,
    status: projectPublicationStatus(record.job, now),
    scheduledAt: new Date(record.scheduledAt).toISOString(),
    timezone: record.timezone,
    ...(record.externalMessageId === null ? {} : { externalMessageId: record.externalMessageId }),
    ...(record.externalMessageIds == null && record.externalMessageId === null
      ? {}
      : { externalMessageIds: record.externalMessageIds ?? [record.externalMessageId ?? ''] }),
    ...(record.lastErrorCode === null ? {} : { lastErrorCode: record.lastErrorCode }),
    revision: record.revision,
    createdAt: new Date(record.createdAt).toISOString(),
    updatedAt: new Date(record.updatedAt).toISOString(),
    postDeleted: record.postDeleted === true,
    ...(record.postSnapshot === undefined ? {} : { postSnapshot: record.postSnapshot })
  };
}
