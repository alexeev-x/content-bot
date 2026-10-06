import type { PostDto } from '@alexeev/contracts';
import type { PostRecord } from './ports';

export function toPostDto(record: PostRecord): PostDto {
  return {
    id: record.id,
    title: record.title,
    body: record.body,
    revision: record.revision,
    status: record.status,
    createdAt: new Date(record.createdAt).toISOString(),
    updatedAt: new Date(record.updatedAt).toISOString()
  };
}
