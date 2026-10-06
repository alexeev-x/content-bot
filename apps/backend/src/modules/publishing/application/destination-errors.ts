import { AppError } from '../../../shared/app-error';

export function destinationNotFound(): AppError {
  return new AppError('NOT_FOUND', 'Destination not found');
}

export function chatIdTaken(): AppError {
  return new AppError('CONFLICT', 'Another destination already uses this chat id', { reason: 'CHAT_ID_TAKEN' });
}

export function staleDestination(): AppError {
  return new AppError('CONFLICT', 'The destination changed since this revision was read', {
    reason: 'STALE_REVISION'
  });
}
