import { AppError } from '../../../shared/app-error';
import type { ScheduleRefusal } from '../domain/schedulable';

export function publicationNotFound(): AppError {
  return new AppError('NOT_FOUND', 'Publication not found');
}

export function scheduleOutOfRange(): AppError {
  return new AppError('VALIDATION_ERROR', 'scheduledAt must be within 5 minutes back and 366 days ahead', {
    reason: 'SCHEDULE_OUT_OF_RANGE'
  });
}

export function staleRevision(): AppError {
  return new AppError('CONFLICT', 'The publication changed since this revision was read', {
    reason: 'STALE_REVISION'
  });
}

export function scheduleRefusal(reason: ScheduleRefusal): AppError {
  switch (reason) {
    case 'POST_NOT_FOUND':
      return new AppError('NOT_FOUND', 'Post not found', { reason });
    case 'DESTINATION_NOT_FOUND':
      return new AppError('NOT_FOUND', 'Destination not found', { reason });
    case 'POST_NOT_APPROVED':
      return new AppError('CONFLICT', 'Only an approved post can be scheduled', { reason });
    case 'POST_ARCHIVED':
      return new AppError('CONFLICT', 'An archived post must be restored before it is scheduled', { reason });
    case 'STALE_REVISION':
      return new AppError('CONFLICT', 'The post is not at this revision', { reason });
    case 'DESTINATION_DISABLED':
      return new AppError('CONFLICT', 'The destination is disabled', { reason });
  }
}
