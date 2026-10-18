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

/** A poll post has no body or media and a text post has no poll (owner, 18.10.2026). */
export function kindMismatch(message: string): AppError {
  return new AppError('VALIDATION_ERROR', message, { reason: 'KIND_MISMATCH' });
}
