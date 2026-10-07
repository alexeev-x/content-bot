import type { PublicationDto } from '@alexeev/contracts';
import { useMemo, type ReactNode } from 'react';
import { DataTable, StatusBadge, type DataColumn } from '../../../shared/ui';
import { browserTimeZone, formatShort } from '../model/format-time';
import { displayStatus, messageLink } from '../model/publication-view';
import { copy } from './copy';
import styles from './PublicationTable.module.css';

export type PublicationChannel = { title: string; chatId: string };

type Props = {
  rows: readonly PublicationDto[];
  /** Titles come from the page (posts and destinations are other features), `undefined` while unknown. */
  postTitle: (publication: PublicationDto) => string | undefined;
  channel: (publication: PublicationDto) => PublicationChannel | undefined;
  onOpen: (publicationId: string) => void;
  isLoading?: boolean;
  emptyState?: ReactNode;
};

// A press on the link must not also open the drawer behind the row's own press handling.
const keepPress = {
  onPointerDown: (event: { stopPropagation: () => void }) => event.stopPropagation(),
  onPointerUp: (event: { stopPropagation: () => void }) => event.stopPropagation(),
  onMouseDown: (event: { stopPropagation: () => void }) => event.stopPropagation(),
  onMouseUp: (event: { stopPropagation: () => void }) => event.stopPropagation(),
  onClick: (event: { stopPropagation: () => void }) => event.stopPropagation(),
  onKeyDown: (event: { stopPropagation: () => void }) => event.stopPropagation(),
  onKeyUp: (event: { stopPropagation: () => void }) => event.stopPropagation()
};

function MessageCell({
  publication,
  channel
}: {
  publication: PublicationDto;
  channel?: PublicationChannel | undefined;
}) {
  const id = displayStatus(publication) === 'sent' ? publication.externalMessageId : undefined;
  if (!id) return <span className={styles.muted}>{copy.list.noMessage}</span>;
  const href = channel ? messageLink(channel.chatId, id) : undefined;
  if (!href) return <span className="mono">{copy.list.messageIdOnly(id)}</span>;
  return (
    <a
      {...keepPress}
      className={styles.link}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={copy.list.messageLinkLabel(id)}
    >
      <span className="mono">{copy.list.messageIdOnly(id)}</span>
    </a>
  );
}

export function PublicationTable({ rows, postTitle, channel, onOpen, isLoading, emptyState }: Props) {
  const zone = useMemo(() => browserTimeZone(), []);
  const columns = useMemo<DataColumn<PublicationDto>[]>(
    () => [
      {
        id: 'post',
        header: copy.list.columns.post,
        isRowHeader: true,
        cell: (row) => {
          const title = postTitle(row) ?? copy.list.unknownPost;
          return (
            <span className={styles.title} title={title}>
              {title}
            </span>
          );
        }
      },
      {
        id: 'status',
        header: copy.list.columns.status,
        compactSlot: 'trailing',
        cell: (row) => <StatusBadge status={displayStatus(row)} />
      },
      {
        id: 'channel',
        header: copy.list.columns.channel,
        cell: (row) => {
          const title = channel(row)?.title;
          return title ? (
            <span className={styles.channel} title={title}>
              {title}
            </span>
          ) : (
            <span className={styles.muted}>{copy.list.unknownChannel}</span>
          );
        }
      },
      {
        id: 'time',
        header: copy.list.columns.time,
        cell: (row) => (
          <time className={`mono ${styles.time}`} dateTime={row.scheduledAt}>
            {formatShort(row.scheduledAt, zone)}
          </time>
        )
      },
      {
        id: 'message',
        header: copy.list.columns.message,
        cell: (row) => <MessageCell publication={row} channel={channel(row)} />
      }
    ],
    [postTitle, channel, zone]
  );
  return (
    <DataTable
      aria-label={copy.list.tableLabel}
      columns={columns}
      rows={rows}
      getRowId={(row) => row.id}
      density="compact"
      onRowAction={onOpen}
      isLoading={isLoading ?? false}
      emptyState={emptyState}
    />
  );
}
