import type { DestinationDto } from '@alexeev/contracts';
import type { DestinationRecord } from './ports';

export function toDestinationDto(record: DestinationRecord): DestinationDto {
  return {
    id: record.id,
    title: record.title,
    chatId: record.chatId,
    kind: record.kind,
    enabled: record.enabled,
    revision: record.revision,
    createdAt: new Date(record.createdAt).toISOString(),
    updatedAt: new Date(record.updatedAt).toISOString()
  };
}
