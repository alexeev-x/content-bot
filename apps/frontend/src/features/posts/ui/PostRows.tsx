import type { PostDto } from '@alexeev/contracts';
import type { ReactNode } from 'react';
import {
  Checkbox,
  DataTable,
  Icon,
  MediaTile,
  Menu,
  PanelList,
  PhoneSkeletonRows,
  RowCard,
  type DataColumn,
  type MenuEntry,
  type RowSelection,
  type TableSort
} from '../../../shared/ui';
import { excerptOf } from '../model/excerpt';
import { formatExact, formatRelative } from '../model/format-time';
import { ARCHIVE_WARNING_DAYS, daysLeftOf, deleteBlockOf, listStateOf, type DeleteBlock } from '../model/post-state';
import type { PostSort, PostSortKey } from '../model/post-sort';
import { postsCopy } from './copy';
import { PostStateBadge } from './PostStateBadge';
import styles from './PostRows.module.css';
import { postRowText, shortFormat } from './row-text';

export type RowAction = 'delete' | 'restore' | 'reconcile' | 'return-to-draft' | 'duplicate';

type Props = {
  mode: 'live' | 'archive';
  label: string;
  rows: readonly PostDto[];
  sort: PostSort;
  onSortChange: (sort: NonNullable<PostSort>) => void;
  now: number;
  isLoading: boolean;
  narrow: boolean;
  /** Checkboxes are shown (after «Выбрать»). */
  selectable: boolean;
  isSelected: (id: string) => boolean;
  allState: 'none' | 'some' | 'all';
  /** The table reports the whole selection of the loaded rows; the list diffs it against its own. */
  onSelectionChange: (selection: RowSelection) => void;
  onToggle: (post: PostDto, on: boolean) => void;
  onToggleAll: (on: boolean) => void;
  /** Why a row could not be deleted or restored in the last bulk run. */
  reasons: ReadonlyMap<string, string>;
  onOpen: (id: string) => void;
  onAction: (post: PostDto, action: RowAction) => void;
  isDuplicating: boolean;
};

const copy = postsCopy;
export const POST_ROW_LOADING = 8;
const titleOf = (post: PostDto) => post.title.trim() || copy.list.untitled;

// The row itself is keyboard-activatable; keep its nested action menu from also opening the post.
const keepRowAction = {
  onPointerDown: (event: { stopPropagation: () => void }) => event.stopPropagation(),
  onPointerUp: (event: { stopPropagation: () => void }) => event.stopPropagation(),
  onMouseDown: (event: { stopPropagation: () => void }) => event.stopPropagation(),
  onMouseUp: (event: { stopPropagation: () => void }) => event.stopPropagation(),
  onClick: (event: { stopPropagation: () => void }) => event.stopPropagation(),
  onKeyDown: (event: { stopPropagation: () => void }) => event.stopPropagation(),
  onKeyUp: (event: { stopPropagation: () => void }) => event.stopPropagation()
};

function blockText(block: DeleteBlock): string {
  return block === 'unknown' ? copy.actions.blockedUnknown : copy.actions.blockedInProgress;
}

export function PostRows(props: Props) {
  return props.narrow ? <Cards {...props} /> : <Grid {...props} />;
}

function menuFor(post: PostDto, mode: Props['mode'], onAction: Props['onAction'], isDuplicating: boolean): ReactNode {
  const block = deleteBlockOf(post);
  const counts = post.publicationSummary.counts;
  const draftBlock =
    counts.unknown > 0
      ? copy.actions.returnDraftBlockedUnknown
      : counts.preparing + counts.sending > 0
        ? copy.actions.returnDraftBlockedInProgress
        : counts.scheduled + counts.queued + counts.retry_wait > 0
          ? copy.actions.returnDraftBlockedPending
          : null;
  const del: MenuEntry =
    mode === 'archive'
      ? { id: 'delete', label: copy.actions.deleteNow, icon: 'trash', tone: 'danger' }
      : block
        ? {
            id: 'delete',
            label: copy.actions.deleteBlocked(blockText(block)),
            icon: 'trash',
            tone: 'danger',
            isDisabled: true
          }
        : { id: 'delete', label: copy.actions.delete, icon: 'trash', tone: 'danger' };
  const reconcile: MenuEntry = { id: 'reconcile', label: copy.actions.reconcile, icon: 'check-circle' };
  const items: MenuEntry[] =
    mode === 'archive'
      ? [{ id: 'restore', label: copy.actions.restore, icon: 'retry' }, del]
      : block === 'unknown'
        ? [reconcile, del]
        : [del];
  items.unshift({
    id: 'duplicate',
    label: isDuplicating ? copy.actions.duplicating : copy.actions.duplicate,
    icon: 'copy',
    isDisabled: isDuplicating
  });
  if (mode === 'live' && post.status === 'approved') {
    items.unshift({
      id: 'return-to-draft',
      label: draftBlock ?? copy.actions.returnToDraft,
      icon: 'edit',
      ...(draftBlock ? { isDisabled: true } : {})
    });
  }
  return (
    <div {...keepRowAction}>
      <Menu
        label={copy.actions.rowMenu(titleOf(post))}
        items={items}
        onAction={(id) =>
          onAction(
            post,
            id === 'restore' || id === 'reconcile' || id === 'return-to-draft' || id === 'duplicate' ? id : 'delete'
          )
        }
      />
    </div>
  );
}

function Failure({ reason }: { reason: string }) {
  return (
    <span className={styles.reason}>
      <Icon name="alert" size={14} />
      {copy.selection.failedReason(reason)}
    </span>
  );
}

function StateCell({ post }: { post: PostDto }) {
  const state = listStateOf(post);
  return (
    <span className={styles.state}>
      <PostStateBadge post={post} />
      {state.kind === 'scheduled' && state.at ? (
        <time dateTime={state.at} className={`${styles.muted} ${styles.nowrap}`} title={formatExact(state.at)}>
          {copy.list.scheduledAt(shortFormat.format(new Date(state.at)))}
        </time>
      ) : null}
    </span>
  );
}

function UpdatedCell({ post, now }: { post: PostDto; now: number }) {
  return (
    <time dateTime={post.updatedAt} title={formatExact(post.updatedAt)} className={`${styles.muted} ${styles.nowrap}`}>
      {formatRelative(post.updatedAt, now)}
    </time>
  );
}

function ChannelsCell({ post }: { post: PostDto }) {
  const text = post.publicationSummary.destinations.map((item) => item.title).join(', ');
  return (
    <span className={`${styles.channels} ${styles.muted}`} title={text || undefined}>
      {text || copy.archive.noChannels}
    </span>
  );
}

function SentCell({ post }: { post: PostDto }) {
  const sent = post.publicationSummary.lastSentAt;
  return sent ? (
    <time dateTime={sent} title={formatExact(sent)} className={`${styles.muted} ${styles.nowrap}`}>
      {shortFormat.format(new Date(sent))}
    </time>
  ) : (
    <span className={styles.muted}>—</span>
  );
}

function LeftCell({ post, now }: { post: PostDto; now: number }) {
  if (post.autoDeleteAt === null) return <span className={styles.muted}>—</span>;
  const days = daysLeftOf(post.autoDeleteAt, now);
  return days <= ARCHIVE_WARNING_DAYS ? (
    <span className={styles.warn} title={formatExact(post.autoDeleteAt)}>
      <Icon name="alert" size={14} />
      {copy.archive.lastDays(days)}
    </span>
  ) : (
    <span className={`${styles.muted} ${styles.nowrap}`} title={formatExact(post.autoDeleteAt)}>
      {copy.archive.daysLeft(days)}
    </span>
  );
}

const toTableSort = (sort: PostSort): TableSort | undefined =>
  sort ? { column: sort.key, direction: sort.direction } : undefined;

function Grid(props: Props) {
  const { mode, rows, now, isLoading, selectable } = props;
  const live = mode === 'live';
  const head = live ? copy.list.columns : copy.archive.columns;
  const blocked = new Set(live ? rows.filter((post) => deleteBlockOf(post) !== null).map((post) => post.id) : []);
  const columns: DataColumn<PostDto>[] = [
    {
      id: 'title',
      header: head.title,
      isRowHeader: true,
      allowsSorting: true,
      cell: (post) => {
        const reason = props.reasons.get(post.id);
        return (
          <span className={styles.cellMedia} data-post-id={post.id}>
            <MediaTile size={40} />
            <span className={styles.cellTitle}>
              <strong className={styles.title}>{titleOf(post)}</strong>
              {reason ? (
                <Failure reason={reason} />
              ) : (
                <span className={styles.excerpt}>{excerptOf(post.body) || copy.list.emptyBody}</span>
              )}
            </span>
          </span>
        );
      }
    },
    ...(live
      ? ([
          {
            id: 'status',
            header: copy.list.columns.status,
            cell: (post: PostDto) => <StateCell post={post} />
          },
          {
            id: 'updated',
            header: copy.list.columns.updated,
            allowsSorting: true,
            cell: (post: PostDto) => <UpdatedCell post={post} now={now} />
          }
        ] satisfies DataColumn<PostDto>[])
      : ([
          {
            id: 'channels',
            header: copy.archive.columns.channels,
            cell: (post: PostDto) => <ChannelsCell post={post} />
          },
          {
            id: 'sentAt',
            header: copy.archive.columns.sentAt,
            allowsSorting: true,
            cell: (post: PostDto) => <SentCell post={post} />
          },
          {
            id: 'left',
            header: copy.archive.columns.left,
            allowsSorting: true,
            cell: (post: PostDto) => <LeftCell post={post} now={now} />
          }
        ] satisfies DataColumn<PostDto>[])),
    {
      id: 'menu',
      header: copy.list.columns.actions,
      align: 'end',
      cell: (post) => menuFor(post, mode, props.onAction, props.isDuplicating)
    }
  ];
  const sort = toTableSort(props.sort);
  return (
    <DataTable
      flush
      rowHeight="tall"
      aria-label={props.label}
      columns={columns}
      rows={rows}
      getRowId={(post) => post.id}
      getRowText={(post) => postRowText(post, now)}
      isLoading={isLoading}
      loadingRows={POST_ROW_LOADING}
      {...(sort ? { sort } : {})}
      onSortChange={(next) => props.onSortChange({ key: next.column as PostSortKey, direction: next.direction })}
      selectionMode={selectable ? 'multiple' : 'none'}
      selected={new Set(rows.filter((post) => props.isSelected(post.id)).map((post) => post.id))}
      onSelectionChange={props.onSelectionChange}
      disabledIds={blocked}
      {...(selectable ? {} : { onRowAction: props.onOpen })}
    />
  );
}

function Cards(props: Props) {
  const { mode, rows, now, isLoading, selectable } = props;
  const live = mode === 'live';
  if (isLoading) return <PhoneSkeletonRows label={props.label} />;
  return (
    <>
      {selectable && rows.length > 0 ? (
        <div className={styles.selectAll}>
          <Checkbox
            isSelected={props.allState === 'all'}
            isIndeterminate={props.allState === 'some'}
            onChange={props.onToggleAll}
          >
            {copy.selection.all}
          </Checkbox>
        </div>
      ) : null}
      <PanelList aria-label={props.label}>
        {rows.map((post) => {
          const block = live ? deleteBlockOf(post) : null;
          const reason = props.reasons.get(post.id);
          const daysLeft = post.autoDeleteAt === null ? null : daysLeftOf(post.autoDeleteAt, now);
          const state = listStateOf(post);
          return (
            <RowCard
              key={post.id}
              title={titleOf(post)}
              media={<MediaTile size={44} />}
              {...(live ? { status: <PostStateBadge post={post} /> } : {})}
              meta={
                live
                  ? state.kind === 'scheduled' && state.at
                    ? copy.list.sendAt(shortFormat.format(new Date(state.at)))
                    : formatRelative(post.updatedAt, now)
                  : daysLeft === null
                    ? copy.archive.noChannels
                    : copy.archive.daysLeft(daysLeft)
              }
              {...(reason
                ? { warning: copy.selection.failedReason(reason) }
                : block === 'unknown'
                  ? { warning: copy.list.checkResult }
                  : !live && daysLeft !== null && daysLeft <= ARCHIVE_WARNING_DAYS
                    ? { warning: copy.archive.lastDaysHint }
                    : {})}
              isActive={props.isSelected(post.id)}
              onPress={() => (selectable ? props.onToggle(post, !props.isSelected(post.id)) : props.onOpen(post.id))}
              {...(selectable
                ? {
                    leading: (
                      <Checkbox
                        aria-label={
                          block
                            ? copy.selection.blockedRow(titleOf(post), blockText(block))
                            : copy.selection.row(titleOf(post))
                        }
                        isDisabled={block !== null}
                        isSelected={props.isSelected(post.id)}
                        onChange={(on) => props.onToggle(post, on)}
                      />
                    )
                  }
                : { menu: menuFor(post, mode, props.onAction, props.isDuplicating) })}
            />
          );
        })}
      </PanelList>
    </>
  );
}
