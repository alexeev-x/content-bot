import type { PostDto, PublicationDto } from '@alexeev/contracts';
import { useMemo } from 'react';
import {
  DataTable,
  Checkbox,
  MediaTile,
  PanelList,
  PhoneSkeletonRows,
  RowCard,
  StatusBadge,
  type DataColumn,
  type RowSelection
} from '../../../shared/ui';
import { browserTimeZone, formatShort } from '../model/format-time';
import { displayStatus, messageLink } from '../model/publication-view';
import { copy } from './copy';
import styles from './PublicationTable.module.css';

export type PublicationChannel = { title: string; chatId: string };
export type PublicationOrder = 'asc' | 'desc';

/** Rows drawn while the list loads: the same geometry as the loaded table. */
export const PUBLICATION_ROW_LOADING = 8;

type Props = {
  rows: readonly PublicationDto[];
  timezone?: string;
  /** Post details come from the page because posts are a separate feature. */
  post: (publication: PublicationDto) => PostDto | undefined;
  channel: (publication: PublicationDto) => PublicationChannel | undefined;
  onOpen: (publicationId: string) => void;
  activeId?: string | undefined;
  isLoading?: boolean;
  /** The text of a whole row, which the search of the panel matches (see `publicationRowText`). */
  rowText?: (publication: PublicationDto) => string;
  /** Desktop: sort by time. */
  order?: PublicationOrder;
  onOrderChange?: (order: PublicationOrder) => void;
  narrow?: boolean;
  selectable?: boolean;
  selected?: ReadonlySet<string>;
  onSelectionChange?: (selection: RowSelection) => void;
  onToggle?: (publication: PublicationDto, selected: boolean) => void;
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

const flat = (body: string) => body.replace(/\s+/g, ' ').trim().slice(0, 140);

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
  if (!value) {
    return (
      <span className={styles.cellMedia}>
        <MediaTile size={40} icon="send" />
        <span className={styles.muted}>{copy.list.unknownPost}</span>
      </span>
    );
  }
  return (
    <span className={styles.cellMedia}>
      <MediaTile size={40} />
      <span className={styles.cellTitle}>
        <strong className={styles.title} title={value.title}>
          {value.title}
        </strong>
        <span className={styles.excerpt} title={value.body}>
          {flat(value.body) || copy.list.noText}
        </span>
      </span>
    </span>
  );
}

export function PublicationTable(props: Props) {
  return props.narrow ? <Cards {...props} /> : <Grid {...props} />;
}

function Grid(props: Props) {
  const { rows, post, channel, onOpen, activeId, isLoading, rowText, order, onOrderChange } = props;
  const blocked = new Set(
    rows
      .filter((row) => row.status !== 'sent' && row.status !== 'failed' && row.status !== 'cancelled')
      .map((row) => row.id)
  );
  const zone = props.timezone ?? browserTimeZone();
  const columns = useMemo<DataColumn<PublicationDto>[]>(
    () => [
      {
        id: 'time',
        header: copy.list.columns.time,
        allowsSorting: true,
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
      flush
      rowHeight="tall"
      aria-label={copy.list.tableLabel}
      columns={columns}
      rows={rows}
      getRowId={(row) => row.id}
      {...(rowText ? { getRowText: rowText } : {})}
      onRowAction={props.selectable ? undefined : onOpen}
      {...(props.selectable
        ? {
            selectionMode: 'multiple' as const,
            selected: props.selected,
            onSelectionChange: props.onSelectionChange,
            disabledIds: blocked
          }
        : {})}
      activeId={activeId}
      isLoading={isLoading ?? false}
      loadingRows={PUBLICATION_ROW_LOADING}
      {...(order ? { sort: { column: 'time', direction: order === 'asc' ? 'ascending' : 'descending' } } : {})}
      onSortChange={(next) => onOrderChange?.(next.direction === 'ascending' ? 'asc' : 'desc')}
    />
  );
}

function Cards({ rows, post, channel, onOpen, activeId, isLoading, selectable, selected, onToggle, timezone }: Props) {
  const zone = timezone ?? browserTimeZone();
  if (isLoading) return <PhoneSkeletonRows label={copy.list.tableLabel} />;
  return (
    <PanelList aria-label={copy.list.tableLabel}>
      {rows.map((row) => {
        const status = displayStatus(row);
        const place = channel(row)?.title ?? copy.list.unknownChannel;
        return (
          <RowCard
            key={row.id}
            title={post(row)?.title ?? copy.list.unknownPost}
            media={<MediaTile size={44} />}
            status={<StatusBadge status={status} />}
            meta={`${formatShort(row.scheduledAt, zone)} · ${place}`}
            {...(status === 'unknown' ? { warning: copy.list.checkChannel } : {})}
            isActive={activeId === row.id || selected?.has(row.id) === true}
            onPress={() => (selectable ? onToggle?.(row, !selected?.has(row.id)) : onOpen(row.id))}
            {...(selectable
              ? {
                  leading: (
                    <Checkbox
                      aria-label={
                        status === 'sent' || status === 'failed' || status === 'cancelled'
                          ? copy.deletion.row(post(row)?.title ?? copy.list.unknownPost)
                          : copy.deletion.blocked(post(row)?.title ?? copy.list.unknownPost)
                      }
                      isDisabled={status !== 'sent' && status !== 'failed' && status !== 'cancelled'}
                      isSelected={selected?.has(row.id) ?? false}
                      onChange={(on) => onToggle?.(row, on)}
                    />
                  )
                }
              : {})}
          />
        );
      })}
    </PanelList>
  );
}
