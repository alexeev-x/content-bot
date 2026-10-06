import type { PublicationDto } from '@alexeev/contracts';
import { copy } from '../ui/copy';
import { formatPrecise } from './format-time';
import { displayStatus } from './publication-view';

export type TimelineEntry = {
  id: string;
  title: string;
  time: string;
  dateTime: string;
  status?: ReturnType<typeof displayStatus>;
  description?: string;
};

// The contract has no attempts endpoint yet, so the history is what the DTO proves: when the request was created,
// when it was planned for and how the latest status came about. Nothing is invented between those moments.
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
