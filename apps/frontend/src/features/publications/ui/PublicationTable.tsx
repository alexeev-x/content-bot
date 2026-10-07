import type { PostDto, PublicationDto } from '@alexeev/contracts';
import { useMemo, type ReactNode } from 'react';
import { DataTable, Icon, StatusBadge, type DataColumn } from '../../../shared/ui';
import { browserTimeZone, formatShort } from '../model/format-time';
import { displayStatus, messageLink } from '../model/publication-view';
import { copy } from './copy';
import styles from './PublicationTable.module.css';

export type PublicationChannel = { title: string; chatId: string };

type Props = {
  rows: readonly PublicationDto[];
  /** Post details come from the page because posts are a separate feature. */
  post: (publication: PublicationDto) => PostDto | undefined;
  channel: (publication: PublicationDto) => PublicationChannel | undefined;
  onOpen: (publicationId: string) => void;
  activeId?: string | undefined;
  isLoading?: boolean;
  emptyState?: ReactNode;
};

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

function PostCell({ value }: { value: PostDto | undefined }) {
  if (!value) return <span className={styles.muted}>{copy.list.unknownPost}</span>;
  return (
    <span className={styles.postCell}>
      <span className={styles.postMark} aria-hidden="true">
        <Icon name="file" size={18} />
      </span>
      <span className={styles.postText}>
        <strong className={styles.title} title={value.title}>
          {value.title}
        </strong>
        <span className={styles.excerpt} title={value.body}>
          {value.body || 'Без текста'}
        </span>
      </span>
    </span>
  );
}

export function PublicationTable({ rows, post, channel, onOpen, activeId, isLoading, emptyState }: Props) {
  const zone = useMemo(() => browserTimeZone(), []);
  const columns = useMemo<DataColumn<PublicationDto>[]>(
    () => [
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
        id: 'post',
        header: copy.list.columns.post,
        isRowHeader: true,
        cell: (row) => <PostCell value={post(row)} />
      },
      {
        id: 'channel',
        header: copy.list.columns.channel,
        cell: (row) => {
          const title = channel(row)?.title;
          return title ? (
            <span className={styles.channel} title={title}>
              <span className={styles.channelIcon} aria-hidden="true">
                <Icon name="send" size={15} />
              </span>
              {title}
            </span>
          ) : (
            <span className={styles.muted}>{copy.list.unknownChannel}</span>
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
        id: 'message',
        header: copy.list.columns.message,
        cell: (row) => <MessageCell publication={row} channel={channel(row)} />
      }
    ],
    [post, channel, zone]
  );

  return (
    <DataTable
      aria-label={copy.list.tableLabel}
      columns={columns}
      rows={rows}
      getRowId={(row) => row.id}
      density="compact"
      onRowAction={onOpen}
      activeId={activeId}
      isLoading={isLoading ?? false}
      emptyState={emptyState}
    />
  );
}
