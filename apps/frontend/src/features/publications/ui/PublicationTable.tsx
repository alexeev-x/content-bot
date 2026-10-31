import { seriesLabel } from '../model/series-label';
import { PAGE_SIZE } from '../../../shared/api/page-query';
import { postHeadline } from '../../../shared/lib/post-headline';
import type { PublicationDto } from '@alexeev/contracts';
import { useMemo } from 'react';
import {
  AiMark,
  DataTable,
  Checkbox,
  GroupedList,
  MediaTile,
  PanelList,
  PhoneSkeletonRows,
  PollMark,
  RowCard,
  StatusBadge,
  type DataColumn,
  type RowSelection
} from '../../../shared/ui';
import { groupByDay } from '../../../shared/lib/group-by-day';
import { browserTimeZone, formatClock, formatShort } from '../model/format-time';
import { displayStatus, messageLink } from '../model/publication-view';
import type { PostPreview } from '../model/row-text';
import { copy } from './copy';
import styles from './PublicationTable.module.css';

export type PublicationChannel = { title: string; chatId: string };
export type PublicationOrder = 'asc' | 'desc';

/** Rows drawn while the list loads: the same geometry as the loaded table. */
export const PUBLICATION_ROW_LOADING = PAGE_SIZE;

type Props = {
  rows: readonly PublicationDto[];
  timezone?: string;
  /** Post details come from the page because posts are a separate feature. */
  post: (publication: PublicationDto) => PostPreview | undefined;
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

function PostCell({
  value,
  deleted,
  origin
}: {
  value: PostPreview | undefined;
  deleted: boolean;
  origin: PublicationDto['postOrigin'];
}) {
  if (!value) {
    return (
      <span className={styles.cellMedia}>
        <MediaTile size={40} icon="send" />
        <span className={styles.muted}>{copy.list.unknownPost}</span>
        {deleted ? <span className={styles.deletedBadge}>{copy.list.postDeleted}</span> : null}
      </span>
    );
  }
  const { headline, rest } = postHeadline(value.title, value.body);
  return (
    <span className={styles.cellMedia}>
      <MediaTile size={40} />
      <span className={styles.cellTitle}>
        <strong className={styles.title} title={headline}>
          {origin ? <AiMark text={copy.list.aiPost(origin.source)} /> : null} {headline || value.title}
          {deleted ? <span className={styles.deletedBadge}>{copy.list.postDeleted}</span> : null}
        </strong>
        {value.kind === 'poll' ? (
          <span className={styles.excerpt}>
            <PollMark label={copy.list.poll} />
          </span>
        ) : value.body.trim() === '' ? (
          <span className={styles.excerpt}>{copy.list.noText}</span>
        ) : rest ? (
          <span className={styles.excerpt} title={value.body}>
            {rest}
          </span>
        ) : null}
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
        width: 150,
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
        cell: (row) => <PostCell value={post(row)} deleted={row.postDeleted === true} origin={row.postOrigin} />
      },
      {
        id: 'channel',
        width: 220,
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
        width: 170,
        header: copy.list.columns.status,
        cell: (row) => {
          const series = seriesLabel(row);
          return (
            <span className={styles.statusCell}>
              <StatusBadge status={displayStatus(row)} />
              {series ? <span className={styles.seriesNote}>{series}</span> : null}
            </span>
          );
        }
      },
      {
        id: 'message',
        width: 140,
        header: copy.list.columns.message,
        cell: (row) => <MessageCell publication={row} channel={channel(row)} />
      }
    ],
    [post, channel, zone]
  );
  const common = sharedChannel(rows, channel);
  const shownColumns = common === undefined ? columns : columns.filter((column) => column.id !== 'channel');

  return (
    <>
      {common === undefined ? null : <p className={styles.channelNote}>{copy.list.allInChannel(common)}</p>}
      <DataTable
        flush
        rowHeight="tall"
        aria-label={copy.list.tableLabel}
        columns={shownColumns}
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
        loadingRows={rows.length > 0 ? rows.length : PUBLICATION_ROW_LOADING}
        {...(order ? { sort: { column: 'time', direction: order === 'asc' ? 'ascending' : 'descending' } } : {})}
        onSortChange={(next) => onOrderChange?.(next.direction === 'ascending' ? 'asc' : 'desc')}
      />
    </>
  );
}

function Cards({ rows, post, channel, onOpen, activeId, isLoading, selectable, selected, onToggle, timezone }: Props) {
  const zone = timezone ?? browserTimeZone();
  if (isLoading) {
    return (
      <div aria-busy="true">
        <PhoneSkeletonRows {...(rows.length > 0 ? { count: rows.length } : {})} label={copy.list.tableLabel} />
      </div>
    );
  }
  const days = groupByDay(rows, (row) => row.scheduledAt, zone);
  const common = sharedChannel(rows, channel);
  // The status chip is never dropped: a failed or `unknown` row must read as such in every group.
  const renderRow = (row: PublicationDto) => {
    const status = displayStatus(row);
    const place = channel(row)?.title ?? copy.list.unknownChannel;
    const meta = [
      seriesLabel(row),
      row.postOrigin ? copy.list.aiShort : undefined,
      common === undefined ? place : undefined,
      row.postDeleted === true ? copy.list.postDeleted : undefined
    ]
      .filter((part): part is string => Boolean(part))
      .join(' · ');
    return (
      <RowCard
        key={row.id}
        title={post(row)?.title ?? copy.list.unknownPost}
        time={formatClock(row.scheduledAt, zone)}
        media={<MediaTile size={44} />}
        status={<StatusBadge status={status} />}
        {...(meta ? { meta } : {})}
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
  };
  return (
    <div className={styles.phoneList}>
      {common === undefined ? null : <p className={styles.common}>{copy.list.allInChannel(common)}</p>}
      <GroupedList
        variant="chip"
        stickyHeaders
        groups={days.map((day) => ({ id: day.key, label: day.label, count: day.items.length }))}
      >
        {(id) => (
          <PanelList aria-label={copy.list.tableLabel}>
            {(days.find((day) => day.key === id)?.items ?? []).map(renderRow)}
          </PanelList>
        )}
      </GroupedList>
    </div>
  );
}

/** The one channel every shown row goes to, so it is said once instead of on every row; `undefined` when they differ. */
export function sharedChannel(
  rows: readonly PublicationDto[],
  channel: (publication: PublicationDto) => PublicationChannel | undefined
): string | undefined {
  if (rows.length < 2) return undefined;
  const first = channel(rows[0] as PublicationDto)?.title;
  if (!first) return undefined;
  return rows.every((row) => channel(row)?.title === first) ? first : undefined;
}
