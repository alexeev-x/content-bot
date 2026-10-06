import { AppError } from '../../../shared/app-error';

export function notFound(): AppError {
  return new AppError('NOT_FOUND', 'Post not found');
}

export function conflict(reason: 'STALE_REVISION' | 'NOT_EDITABLE' | 'ALREADY_APPROVED'): AppError {
  const message = {
    STALE_REVISION: 'The post changed since this revision was read',
    NOT_EDITABLE: 'Only drafts can be edited',
    ALREADY_APPROVED: 'The post is already approved'
  }[reason];
  return new AppError('CONFLICT', message, { reason });
}
