import type { PublicationDto, PublicationHistoryDto, PublicationHistoryEvent } from '@alexeev/contracts';
import { copy } from '../ui/copy';
import { formatPrecise } from './format-time';
import { explainErrorCode } from './publication-errors';
import { displayStatus } from './publication-view';

export type TimelineEntry = {
  id: string;
  title: string;
  time: string;
  dateTime: string;
  status?: ReturnType<typeof displayStatus>;
  description?: string;
};

// Fallback while the history loads or when it failed: what the DTO alone proves (created, planned for, latest
// status). Nothing is invented between those moments.
export function buildTimeline(publication: PublicationDto, zone: string): TimelineEntry[] {
  const t = copy.drawer.timeline;
  const entries: TimelineEntry[] = [
    {
      id: 'created',
      title: t.created,
      time: formatPrecise(publication.createdAt, zone),
      dateTime: publication.createdAt
    },
    {
      id: 'scheduled',
      title: t.scheduled,
      time: formatPrecise(publication.scheduledAt, zone),
      dateTime: publication.scheduledAt,
      ...(publication.status === 'scheduled' ? { status: 'scheduled' as const } : {})
    }
  ];
  const shown = displayStatus(publication);
  if (publication.status !== 'scheduled') {
    const confirmedId = shown === 'sent' ? publication.externalMessageId : undefined;
    const title =
      shown === 'sent'
        ? t.sent
        : shown === 'preparing' || shown === 'sending'
          ? t.sending
          : shown === 'unknown'
            ? t.unknown
            : t[shown];
    const description = confirmedId ? t.messageId(confirmedId) : '';
    entries.push({
      id: 'latest',
      title,
      time: formatPrecise(publication.updatedAt, zone),
      dateTime: publication.updatedAt,
      status: shown,
      ...(description ? { description } : {})
    });
  }
  return entries.sort((a, b) => Date.parse(a.dateTime) - Date.parse(b.dateTime));
}

function eventEntry(
  event: PublicationHistoryEvent,
  index: number,
  zone: string,
  publication: PublicationDto
): TimelineEntry {
  const t = copy.drawer.timeline;
  const base = { id: `${event.kind}-${index}`, time: formatPrecise(event.at, zone), dateTime: event.at };
  const planned =
    'scheduledAt' in event && event.scheduledAt ? t.plannedFor(formatPrecise(event.scheduledAt, zone)) : '';
  const withDescription = (title: string, description: string, status?: TimelineEntry['status']) => ({
    ...base,
    title,
    ...(description ? { description } : {}),
    ...(status ? { status } : {})
  });
  switch (event.kind) {
    case 'created':
      return withDescription(t.created, planned);
    case 'rescheduled':
      return withDescription(t.rescheduled, planned);
    case 'cancelled':
      return withDescription(t.cancelled, '', 'cancelled');
    case 'resolved':
      return withDescription(
        event.outcome === 'sent' ? t.resolvedSent : event.outcome === 'resend' ? t.resolvedResend : t.resolvedCancel,
        planned
      );
    case 'attempt': {
      const attempt = t.attemptNumber(event.attempt);
      const reason = event.errorCode ? explainErrorCode(event.errorCode) : '';
      switch (event.outcome) {
        case 'sent': {
          const id = displayStatus(publication) === 'sent' ? publication.externalMessageId : undefined;
          return withDescription(t.attemptSent, id ? t.messageId(id) : attempt, 'sent');
        }
        case 'rate_limited':
          return withDescription(
            t.attemptRateLimited,
            event.retryAfterSeconds === null ? attempt : t.attemptWait(event.retryAfterSeconds),
            'retry_wait'
          );
        case 'rejected':
          return withDescription(t.attemptRejected, reason || attempt, 'failed');
        case 'unknown':
          return withDescription(t.attemptUnknown, t.attemptUnknownHint, 'unknown');
        case 'skipped':
          return withDescription(t.attemptSkipped, reason || attempt, 'failed');
        case 'lease_expired':
          return withDescription(t.attemptInterrupted, attempt, 'unknown');
      }
    }
  }
}

/**
 * The full history from the server: every owner action and send attempt, then the plan still ahead (a scheduled
 * publication shows when it will go out as the last step).
 */
export function buildHistoryTimeline(
  history: PublicationHistoryDto,
  publication: PublicationDto,
  zone: string
): TimelineEntry[] {
  const entries = history.items.map((event, index) => eventEntry(event, index, zone, publication));
  const shown = displayStatus(publication);
  if (shown === 'scheduled' || shown === 'queued' || shown === 'retry_wait') {
    entries.push({
      id: 'next',
      title: copy.drawer.timeline.scheduled,
      time: formatPrecise(publication.scheduledAt, zone),
      dateTime: publication.scheduledAt,
      status: shown
    });
  }
  return entries;
}
