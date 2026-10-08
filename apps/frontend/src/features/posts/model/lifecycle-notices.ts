import { classifyApiError } from '../../../shared/api/error-kind';
import { ApiError } from '../../../shared/api/http-client';
import type { BannerTone } from '../../../shared/ui';
import { postsCopy } from '../ui/copy';

const copy = postsCopy.lifecycle;

export type LifecycleNotice = {
  tone: BannerTone;
  title: string;
  body: string;
  requestId?: string | undefined;
  /** The publication that blocks the action, for a link to it. */
  publicationId?: string | undefined;
};

export type Described =
  /** The server state differs from what the owner saw: close the dialog, refetch, show the banner. */
  | { kind: 'state'; notice: LifecycleNotice }
  /** Nothing is known to have changed: stay in the dialog, offer a retry. */
  | { kind: 'retry'; notice: LifecycleNotice };

export type LifecycleAction = 'delete' | 'archive' | 'restore';

/** Maps a failed delete or restore to Russian text; 409 and 404 mean the state moved, everything else is retryable. */
export function describeLifecycleError(error: unknown, action: LifecycleAction): Described {
  const requestId = error instanceof ApiError ? error.requestId : undefined;
  const state = (tone: BannerTone, text: { title: string; body: string }, publicationId?: string): Described => ({
    kind: 'state',
    notice: { tone, ...text, requestId, publicationId }
  });
  if (error instanceof ApiError && error.code === 'CONFLICT') {
    switch (error.reason) {
      case 'STALE_REVISION':
        return state('conflict', copy.notices.stale);
      case 'PUBLICATION_PENDING':
        return state('warning', copy.notices.pending, error.details?.['publicationId']);
      case 'PUBLICATION_IN_PROGRESS':
        return state('warning', copy.notices.inProgress, error.details?.['publicationId']);
      case 'PUBLICATION_UNKNOWN':
        return state('warning', copy.notices.unknown, error.details?.['publicationId']);
      case 'ALREADY_ARCHIVED':
        return state('info', copy.notices.alreadyArchived);
      case 'NOT_ARCHIVED':
        return state('info', copy.notices.notArchived);
    }
  }
  const kind = classifyApiError(error);
  if (kind === 'not_found') return state('info', copy.notices.notFound);
  const message =
    kind === 'validation'
      ? copy.errors.validation
      : kind === 'unavailable'
        ? copy.errors.unavailable
        : kind === 'rate_limited'
          ? copy.errors.rate
          : kind === 'forbidden'
            ? copy.errors.forbidden
            : copy.errors.generic;
  return {
    kind: 'retry',
    notice: {
      tone: 'error',
      title:
        action === 'delete'
          ? copy.errors.deleteTitle
          : action === 'archive'
            ? copy.errors.archiveTitle
            : copy.errors.restoreTitle,
      body: `${message} ${
        action === 'delete'
          ? copy.errors.nothingRemoved
          : action === 'archive'
            ? copy.errors.nothingArchived
            : copy.errors.nothingRestored
      }`,
      requestId
    }
  };
}

export function refusalText(reason: keyof typeof copy.refused): string {
  return copy.refused[reason];
}
