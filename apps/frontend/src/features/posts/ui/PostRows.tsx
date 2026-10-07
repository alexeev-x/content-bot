import type { PostDto } from '@alexeev/contracts';
import { useRef, type ReactNode } from 'react';
import { Checkbox, Icon, Menu, Skeleton, VisuallyHidden, type MenuEntry } from '../../../shared/ui';
import { excerptOf } from '../model/excerpt';
import { formatExact, formatRelative } from '../model/format-time';
import { ARCHIVE_WARNING_DAYS, daysLeftOf, deleteBlockOf, listStateOf, type DeleteBlock } from '../model/post-state';
import type { PostSort, PostSortKey } from '../model/post-sort';
import { postsCopy } from './copy';
import { PostStateBadge } from './PostStateBadge';
import styles from './PostRows.module.css';

export type RowAction = 'delete' | 'restore' | 'reconcile';

type Props = {
  mode: 'live' | 'archive';
  label: string;
  rows: readonly PostDto[];
  sort: PostSort;
  onSortChange: (key: PostSortKey) => void;
  now: number;
  isLoading: boolean;
  narrow: boolean;
  /** Checkboxes are shown (always on desktop, after «Выбрать» on a phone). */
  selectable: boolean;
  isSelected: (id: string) => boolean;
  allState: 'none' | 'some' | 'all';
  onToggle: (post: PostDto, on: boolean, shift: boolean) => void;
  onToggleAll: (on: boolean) => void;
  /** Why a row could not be deleted or restored in the last bulk run. */
  reasons: ReadonlyMap<string, string>;
  onOpen: (id: string) => void;
  onAction: (post: PostDto, action: RowAction) => void;
};

const copy = postsCopy;
const titleOf = (post: PostDto) => post.title.trim() || copy.list.untitled;

function blockText(block: DeleteBlock): string {
  return block === 'unknown' ? copy.actions.blockedUnknown : copy.actions.blockedInProgress;
}

export function PostRows(props: Props) {
  return props.narrow ? <Cards {...props} /> : <Grid {...props} />;
}

type Inner = Props;

function menuFor(post: PostDto, mode: Props['mode'], onAction: Props['onAction']): ReactNode {
  const block = deleteBlockOf(post);
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
  return (
    <span className={styles.interactive}>
      <Menu
        label={copy.actions.rowMenu(titleOf(post))}
        items={items}
        onAction={(id) => onAction(post, id === 'restore' || id === 'reconcile' ? id : 'delete')}
      />
    </span>
  );
}

function SelectBox({ post, props }: { post: PostDto; props: Inner }) {
  const shift = useRef(false);
  const block = props.mode === 'live' ? deleteBlockOf(post) : null;
  const title = titleOf(post);
  return (
    <span
      className={styles.interactive}
      title={block ? blockText(block) : undefined}
      // The shift state is read by the change handler that React fires from this same click.
      onClickCapture={(event) => {
        shift.current = event.shiftKey;
      }}
    >
      <Checkbox
        aria-label={block ? copy.selection.blockedRow(title, blockText(block)) : copy.selection.row(title)}
        isDisabled={block !== null}
        isSelected={props.isSelected(post.id)}
        onChange={(on) => props.onToggle(post, on, shift.current)}
      />
    </span>
  );
}

function TitleBlock({ post, props, stacked }: { post: PostDto; props: Inner; stacked: boolean }) {
  const reason = props.reasons.get(post.id);
  return (
    <>
      <span className={stacked ? undefined : styles.titleCell}>
        <button type="button" className={styles.open} onClick={() => props.onOpen(post.id)}>
          {titleOf(post)}
        </button>
        {stacked ? null : <span className={styles.excerpt}>{excerptOf(post.body) || copy.list.emptyBody}</span>}
      </span>
      {reason ? (
        <span className={styles.reason}>
          <Icon name="alert" size={14} />
          {copy.selection.failedReason(reason)}
        </span>
      ) : null}
    </>
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

const shortFormat = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit'
});

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
  const last = days <= ARCHIVE_WARNING_DAYS;
  return last ? (
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

function Grid(props: Inner) {
  const { mode, rows, now, isLoading, selectable } = props;
  const live = mode === 'live';
  const cols: { key: PostSortKey; label: string }[] = live
    ? [
        { key: 'title', label: copy.list.columns.title },
        { key: 'status', label: copy.list.columns.status },
        { key: 'updated', label: copy.list.columns.updated },
        { key: 'revision', label: copy.list.columns.revision }
      ]
    : [
        { key: 'title', label: copy.archive.columns.title },
        { key: 'channels', label: copy.archive.columns.channels },
        { key: 'sentAt', label: copy.archive.columns.sentAt },
        { key: 'left', label: copy.archive.columns.left }
      ];
  return (
    <div className={styles.wrap} aria-busy={isLoading || undefined}>
      <table className={styles.table}>
        <caption>
          <VisuallyHidden>{props.label}</VisuallyHidden>
        </caption>
        <thead>
          <tr>
            {selectable ? (
              <th scope="col" className={`${styles.th} ${styles.selectCol}`}>
                <Checkbox
                  aria-label={copy.selection.all}
                  isSelected={props.allState === 'all'}
                  isIndeterminate={props.allState === 'some'}
                  isDisabled={isLoading || rows.length === 0}
                  onChange={props.onToggleAll}
                />
              </th>
            ) : null}
            {cols.map(({ key, label }, index) => {
              const active = props.sort?.key === key;
              return (
                <th
                  key={key}
                  scope="col"
                  className={styles.th}
                  data-align={live && index === 3 ? 'end' : undefined}
                  aria-sort={active ? props.sort?.direction : undefined}
                >
                  <button type="button" className={styles.sortButton} onClick={() => props.onSortChange(key)}>
                    {label}
                    {/* Always in the layout, so the label never shifts; an inactive column shows it on hover only. */}
                    <Icon
                      name={active && props.sort?.direction === 'ascending' ? 'arrow-up' : 'arrow-down'}
                      size={14}
                      className={styles.sortMark}
                    />
                  </button>
                </th>
              );
            })}
            <th scope="col" className={styles.th}>
              <VisuallyHidden>{copy.list.columns.actions}</VisuallyHidden>
            </th>
          </tr>
        </thead>
        <tbody>
          {isLoading
            ? Array.from({ length: 5 }, (_, index) => (
                <tr key={`skeleton-${index}`}>
                  <td className={styles.td} colSpan={cols.length + 2}>
                    <Skeleton height={14} width="70%" />
                  </td>
                </tr>
              ))
            : rows.map((post) => (
                <tr
                  key={post.id}
                  className={styles.row}
                  data-post-id={post.id}
                  data-selected={props.isSelected(post.id) || undefined}
                >
                  {selectable ? (
                    <td className={`${styles.td} ${styles.selectCol}`}>
                      <SelectBox post={post} props={props} />
                    </td>
                  ) : null}
                  <td className={`${styles.td} ${styles.titleCol}`}>
                    <TitleBlock post={post} props={props} stacked={false} />
                  </td>
                  {live ? (
                    <>
                      <td className={styles.td}>
                        <StateCell post={post} />
                      </td>
                      <td className={styles.td}>
                        <UpdatedCell post={post} now={now} />
                      </td>
                      <td className={styles.td} data-align="end">
                        <span className={`mono ${styles.muted}`}>{copy.list.revision(post.revision)}</span>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className={styles.td}>
                        <ChannelsCell post={post} />
                      </td>
                      <td className={styles.td}>
                        <SentCell post={post} />
                      </td>
                      <td className={styles.td}>
                        <LeftCell post={post} now={now} />
                      </td>
                    </>
                  )}
                  <td className={`${styles.td} ${styles.actionCol}`}>{menuFor(post, mode, props.onAction)}</td>
                </tr>
              ))}
        </tbody>
      </table>
    </div>
  );
}

function Cards(props: Inner) {
  const { mode, rows, now, isLoading, selectable } = props;
  const live = mode === 'live';
  return (
    <div aria-busy={isLoading || undefined}>
      {selectable && !isLoading && rows.length > 0 ? (
        <Checkbox
          aria-label={copy.selection.all}
          isSelected={props.allState === 'all'}
          isIndeterminate={props.allState === 'some'}
          onChange={props.onToggleAll}
        >
          {copy.selection.all}
        </Checkbox>
      ) : null}
      <ul className={styles.list} aria-label={props.label}>
        {isLoading
          ? Array.from({ length: 3 }, (_, index) => (
              <li key={`skeleton-${index}`} className={styles.skeletonRow}>
                <Skeleton height={18} width="60%" />
                <Skeleton height={14} width="40%" />
              </li>
            ))
          : rows.map((post) => (
              <li
                key={post.id}
                className={styles.item}
                data-post-id={post.id}
                data-selected={props.isSelected(post.id) || undefined}
              >
                <div className={styles.head}>
                  {selectable ? <SelectBox post={post} props={props} /> : null}
                  <div className={styles.cardMain}>
                    <TitleBlock post={post} props={props} stacked />
                  </div>
                  {live ? (
                    <div className={styles.trail}>
                      <StateCell post={post} />
                    </div>
                  ) : null}
                  {menuFor(post, mode, props.onAction)}
                </div>
                <div className={styles.meta}>
                  {live ? (
                    <>
                      <UpdatedCell post={post} now={now} />
                      <span className="mono">{copy.list.revision(post.revision)}</span>
                    </>
                  ) : (
                    <>
                      <LeftCell post={post} now={now} />
                      <SentCell post={post} />
                      <ChannelsCell post={post} />
                    </>
                  )}
                </div>
              </li>
            ))}
      </ul>
    </div>
  );
}
