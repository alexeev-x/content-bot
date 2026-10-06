import type { PublicationDto, PublicationStatus } from '@alexeev/contracts';

export type PublicationActions = {
  /** Cancel is accepted only before sending starts. */
  canCancel: boolean;
  canReschedule: boolean;
  /** A send that may have happened but is unconfirmed: resolved manually, never by retry or cancel. */
  needsReconciliation: boolean;
};

const BEFORE_SENDING: ReadonlySet<PublicationStatus> = new Set(['scheduled', 'queued', 'retry_wait']);

// There is deliberately no retry capability: the contract has no retry endpoint, and `unknown`
// must never be retried automatically or by hand from this UI.
export function publicationActions(status: PublicationStatus): PublicationActions {
  const beforeSending = BEFORE_SENDING.has(status);
  return { canCancel: beforeSending, canReschedule: beforeSending, needsReconciliation: status === 'unknown' };
}

/** «Опубликовано» requires `sent` and the Telegram message id; a 202 or a bare `sent` is not enough. */
export function isConfirmedSent(publication: Pick<PublicationDto, 'status' | 'externalMessageId'>): boolean {
  return publication.status === 'sent' && Boolean(publication.externalMessageId);
}
