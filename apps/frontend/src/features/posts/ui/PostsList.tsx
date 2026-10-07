import type { PostDto, PostDeleteRefusal, PostRestoreRefusal } from '@alexeev/contracts';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { classifyApiError } from '../../../shared/api/error-kind';
import { ApiError } from '../../../shared/api/http-client';
import {
  Button,
  EmptyState,
  ErrorState,
  Select,
  SearchField,
  SelectionBar,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  useMediaQuery
} from '../../../shared/ui';
import type { SelectOption } from '../../../shared/ui';
import { ru } from '../../../shared/lib/ru';
import { postsInfiniteQueryOptions } from '../api/posts-queries';
import { filterPostsByText } from '../model/excerpt';
import { refusalText, type LifecycleNotice } from '../model/lifecycle-notices';
import { deleteBlockOf } from '../model/post-state';
import { nextPostSort, sortPosts, type PostSort, type PostSortKey, type SortDirection } from '../model/post-sort';
import { useNow } from '../model/use-now';
import { useRestoreActions } from '../model/use-restore';
import { useSelection } from '../model/use-selection';
import { postsCopy } from './copy';
import { deleteTargetOf, DeletePostsDialog, type DeleteOutcome, type DeleteTarget } from './DeletePostsDialog';
import { LifecycleBanner } from './LifecycleBanner';
import { PostRows, type RowAction } from './PostRows';
import styles from './PostsList.module.css';

export type PostsView = 'all' | 'drafts' | 'archive';

type Props = {
  view: PostsView;
  query: string;
  onViewChange: (view: PostsView) => void;
  onQueryChange: (query: string) => void;
  onOpen: (id: string) => void;
  onCreate: () => void;
  /** Opens the reconciliation of this post's `unknown` publication (the page resolves which one). */
  onReconcile: (postId: string) => void;
};

const copy = postsCopy.list;
const NARROW = '(max-width: 859px)';
const VIEWS: readonly PostsView[] = ['all', 'drafts', 'archive'];

type Reason = { reason: PostDeleteRefusal | PostRestoreRefusal; text: string };

function filtersFor(view: PostsView) {
  if (view === 'archive') return { view: 'archive' } as const;
  return view === 'drafts' ? ({ view: 'live', status: 'draft' } as const) : ({ view: 'live' } as const);
}

function sortOptionsFor(view: PostsView): SelectOption[] {
  const columns: { key: PostSortKey; label: string }[] =
    view === 'archive'
      ? [
          { key: 'title', label: postsCopy.archive.columns.title },
          { key: 'channels', label: postsCopy.archive.columns.channels },
          { key: 'sentAt', label: postsCopy.archive.columns.sentAt },
          { key: 'left', label: postsCopy.archive.columns.left }
        ]
      : [
          { key: 'title', label: copy.columns.title },
          { key: 'status', label: copy.columns.status },
          { key: 'updated', label: copy.columns.updated },
          { key: 'revision', label: copy.columns.revision }
        ];
  return [
    { id: 'none', label: 'По умолчанию' },
    ...columns.flatMap(({ key, label }) => [
      { id: `${key}:ascending`, label: `${label} — ${ru.ui.sortAsc}` },
      { id: `${key}:descending`, label: `${label} — ${ru.ui.sortDesc}` }
    ])
  ];
}

export function PostsList({ view, query, onViewChange, onQueryChange, onOpen, onCreate, onReconcile }: Props) {
  const now = useNow();
  const narrow = useMediaQuery(NARROW);
  const rootRef = useRef<HTMLElement>(null);
  const focusAfter = useRef<string | null>(null);
  const firstFailed = useRef<string | null>(null);
  const isArchive = view === 'archive';
  const result = useInfiniteQuery(postsInfiniteQueryOptions(filtersFor(view)));
  const loaded = useMemo(() => result.data?.pages.flatMap((page) => page.items) ?? [], [result.data]);
  const rows = useMemo(() => filterPostsByText(loaded, query), [loaded, query]);
  const isFiltered = view === 'drafts' || query.trim() !== '';

  // The archive size rides on every page; keep the last known value while another tab is loading.
  const fresh = result.data?.pages[0]?.archivedCount;
  const [lastCount, setLastCount] = useState<number | undefined>(undefined);
  if (fresh !== undefined && fresh !== lastCount) setLastCount(fresh);
  const archivedCount = fresh ?? lastCount;
  const [sortState, setSortState] = useState<{ view: PostsView; sort: PostSort }>({ view, sort: null });
  const sort = sortState.view === view ? sortState.sort : null;
  const sortedRows = useMemo(() => sortPosts(rows, sort), [rows, sort]);
  const sortOptions = useMemo(() => sortOptionsFor(view), [view]);
  const sortValue = sort ? `${sort.key}:${sort.direction}` : 'none';
  const onSortChange = (key: PostSortKey) => setSortState({ view, sort: nextPostSort(sort, key) });
  const onMobileSortChange = (value: string) => {
    if (!sortOptions.some((option) => option.id === value)) return;
    if (value === 'none') {
      setSortState({ view, sort: null });
      return;
    }
    const [key, direction] = value.split(':');
    if (key && direction) {
      setSortState({ view, sort: { key: key as PostSortKey, direction: direction as SortDirection } });
    }
  };

  const selection = useSelection(view);
  const [selectMode, setSelectMode] = useState(false);
  const [notice, setNotice] = useState<LifecycleNotice | null>(null);
  const [reasonState, setReasonState] = useState<{ view: PostsView; map: ReadonlyMap<string, Reason> }>({
    view,
    map: new Map()
  });
  const reasons = reasonState.view === view ? reasonState.map : new Map<string, Reason>();
  const [deleteTargets, setDeleteTargets] = useState<DeleteTarget[] | null>(null);

  const showFailures = () => {
    const id = firstFailed.current;
    const button = id ? rootRef.current?.querySelector<HTMLElement>(`[data-post-id="${id}"] button`) : null;
    button?.scrollIntoView({ block: 'center' });
    button?.focus();
  };
  const restore = useRestoreActions({ onNotice: setNotice, onShowFailures: showFailures });

  const selectedPosts = useMemo(() => loaded.filter((post) => selection.has(post.id)), [loaded, selection]);
  const selectableRows = useMemo(
    () => sortedRows.filter((post) => isArchive || deleteBlockOf(post) === null),
    [sortedRows, isArchive]
  );
  const selectedVisible = selectableRows.filter((post) => selection.has(post.id)).length;
  const allState = selectedVisible === 0 ? 'none' : selectedVisible === selectableRows.length ? 'all' : 'some';
  const selectable = !narrow || selectMode;

  // After a removal, focus moves to the neighbour (or the previous row when it was last).
  useEffect(() => {
    const id = focusAfter.current;
    if (id === null) return;
    const button = rootRef.current?.querySelector<HTMLElement>(`[data-post-id="${id}"] button`);
    if (button) {
      focusAfter.current = null;
      button.focus();
    }
  }, [sortedRows]);

  const neighbourOf = (id: string): string | null => {
    const index = sortedRows.findIndex((post) => post.id === id);
    return (sortedRows[index + 1] ?? sortedRows[index - 1])?.id ?? null;
  };

  const refOf = (post: PostDto) => ({ id: post.id, revision: post.revision });
  // A row the server refused as changed is re-confirmed in the dialog, so it is sent with its fresh revision.
  const revisionFor = (post: PostDto) =>
    reasons.get(post.id)?.reason === 'STALE_REVISION'
      ? post.revision
      : (selection.revisionOf(post.id) ?? post.revision);

  function recordRefusals(refused: ReadonlyMap<string, PostDeleteRefusal | PostRestoreRefusal>) {
    const map = new Map<string, Reason>();
    for (const [id, reason] of refused) map.set(id, { reason, text: refusalText(reason) });
    firstFailed.current = [...refused.keys()][0] ?? null;
    setReasonState({ view, map });
  }

  function onAction(post: PostDto, action: RowAction) {
    setNotice(null);
    if (action === 'reconcile') {
      onReconcile(post.id);
      return;
    }
    if (action === 'delete') {
      setDeleteTargets([deleteTargetOf(post)]);
      return;
    }
    const next = neighbourOf(post.id);
    void restore.restoreOne(refOf(post)).then((ok) => {
      if (ok) focusAfter.current = next;
    });
  }

  function onDeleted({ deleted, refused }: DeleteOutcome) {
    selection.remove(deleted);
    recordRefusals(refused);
    if (deleted.length === 1 && deleteTargets?.length === 1) focusAfter.current = neighbourOf(deleted[0]!);
  }

  async function restoreSelected() {
    setNotice(null);
    const outcome = await restore.restoreMany(
      selectedPosts.map((post) => ({ id: post.id, revision: revisionFor(post) }))
    );
    if (!outcome) return;
    selection.remove(outcome.restored);
    recordRefusals(outcome.refused);
  }

  function clearSelection() {
    selection.clear();
    setSelectMode(false);
    setReasonState({ view, map: new Map() });
  }

  // Esc clears the selection. A document listener (cleaned up) so no static element carries a key handler; an open
  // dialog or menu handles its own Esc first and marks the event as handled.
  const clearRef = useRef(clearSelection);
  useEffect(() => {
    clearRef.current = clearSelection;
  });
  const hasSelection = selection.count > 0;
  useEffect(() => {
    if (!hasSelection) return;
    const onKey = (event: KeyboardEvent) => {
      if (
        event.key === 'Escape' &&
        !event.defaultPrevented &&
        document.querySelector('[role="alertdialog"]') === null
      ) {
        clearRef.current();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [hasSelection]);

  const reasonText = useMemo(() => new Map([...reasons].map(([id, item]) => [id, item.text])), [reasons]);
  const copyFor = isArchive ? postsCopy.archive : copy;
  const reset = () => {
    onViewChange('all');
    onQueryChange('');
  };

  return (
    <section ref={rootRef} className={styles.list}>
      <Tabs selectedKey={view} onSelectionChange={(key) => onViewChange(key as PostsView)}>
        <TabList aria-label={copy.tabs.label}>
          {VIEWS.map((id) => (
            <Tab key={id} id={id}>
              {copy.tabs[id]}
              {id === 'archive' && archivedCount !== undefined ? (
                <span className={styles.count}>{archivedCount}</span>
              ) : null}
            </Tab>
          ))}
        </TabList>
        <TabPanel id={view} shouldForceMount={false}>
          <div className={styles.panel}>
            {isArchive ? <p className={styles.note}>{postsCopy.archive.note}</p> : null}
            {notice ? <LifecycleBanner notice={notice} onDismiss={() => setNotice(null)} /> : null}

            <div className={styles.toolbar}>
              <div className={styles.search}>
                <SearchField
                  label={copy.searchLabel}
                  placeholder={copy.searchPlaceholder}
                  value={query}
                  onChange={onQueryChange}
                />
              </div>
              {narrow && sortedRows.length > 0 ? (
                <div className={styles.sortControl}>
                  <Select label={ru.ui.sortBy} options={sortOptions} value={sortValue} onChange={onMobileSortChange} />
                </div>
              ) : null}
              {narrow && rows.length > 0 ? (
                <Button
                  variant="secondary"
                  icon="check"
                  onPress={() => (selectMode ? clearSelection() : setSelectMode(true))}
                >
                  {selectMode ? postsCopy.selection.done : postsCopy.selection.select}
                </Button>
              ) : null}
            </div>

            {result.isError ? (
              <ListError error={result.error} isArchive={isArchive} onRetry={() => void result.refetch()} />
            ) : !result.isPending && rows.length === 0 ? (
              <EmptyState
                icon={isArchive ? 'clock' : 'file'}
                title={isFiltered ? copyFor.filteredEmptyTitle : copyFor.emptyTitle}
                description={isFiltered ? copyFor.filteredEmptyDescription : copyFor.emptyDescription}
                action={
                  isFiltered ? (
                    <Button variant="secondary" onPress={reset}>
                      {copy.resetFilters}
                    </Button>
                  ) : isArchive ? undefined : (
                    <Button icon="plus" onPress={onCreate}>
                      {copy.create}
                    </Button>
                  )
                }
              />
            ) : (
              <PostRows
                mode={isArchive ? 'archive' : 'live'}
                label={isArchive ? postsCopy.archive.tableLabel : copy.tableLabel}
                rows={sortedRows}
                sort={sort}
                onSortChange={onSortChange}
                now={now}
                isLoading={result.isPending}
                narrow={narrow}
                selectable={selectable}
                isSelected={selection.has}
                allState={allState}
                onToggle={(post, on, shift) => {
                  const ref = { id: post.id, revision: post.revision };
                  if (on && shift) {
                    selection.selectRange(
                      selectableRows.map((row) => ({ id: row.id, revision: row.revision })),
                      ref
                    );
                  } else selection.toggle(ref, on);
                }}
                onToggleAll={(on) =>
                  on
                    ? selection.setAll(selectableRows.map((row) => ({ id: row.id, revision: row.revision })))
                    : selection.remove(selectableRows.map((row) => row.id))
                }
                reasons={reasonText}
                onOpen={onOpen}
                onAction={onAction}
              />
            )}

            {!result.isPending && !result.isError ? (
              <div className={styles.footer}>
                <output className={styles.muted}>{copy.loaded(loaded.length)}</output>
                {sort && result.hasNextPage ? <span className={styles.muted}>{copy.sortLoadedOnly}</span> : null}
                {query.trim() !== '' && result.hasNextPage ? (
                  <span className={styles.muted}>{copy.searchScope}</span>
                ) : null}
                {result.isFetchNextPageError ? <span className={styles.failed}>{copy.loadMoreFailed}</span> : null}
                {result.hasNextPage ? (
                  <Button
                    variant="secondary"
                    isLoading={result.isFetchingNextPage}
                    onPress={() => void result.fetchNextPage()}
                  >
                    {result.isFetchingNextPage ? copy.loadingMore : copy.loadMore}
                  </Button>
                ) : null}
              </div>
            ) : null}

            {selectedPosts.length > 0 || (narrow && selectMode) ? (
              <SelectionBar
                label={postsCopy.selection.bar}
                summary={postsCopy.selection.selected(selectedPosts.length)}
                {...(selection.isFull ? { hint: postsCopy.selection.limit(100) } : {})}
              >
                {isArchive ? (
                  <Button
                    variant="secondary"
                    icon="retry"
                    isLoading={restore.isPending}
                    isDisabled={selectedPosts.length === 0}
                    onPress={() => void restoreSelected()}
                  >
                    {postsCopy.selection.restore}
                  </Button>
                ) : null}
                <Button
                  variant="danger"
                  icon="trash"
                  isDisabled={selectedPosts.length === 0}
                  onPress={() => {
                    setNotice(null);
                    setDeleteTargets(
                      selectedPosts.map((post) => ({ ...deleteTargetOf(post), revision: revisionFor(post) }))
                    );
                  }}
                >
                  {postsCopy.selection.delete}
                </Button>
                <Button variant="ghost" onPress={clearSelection}>
                  {postsCopy.selection.clear}
                </Button>
              </SelectionBar>
            ) : null}
          </div>
        </TabPanel>
      </Tabs>

      {deleteTargets ? (
        <DeletePostsDialog
          targets={deleteTargets}
          onOpenChange={(open) => {
            if (!open) setDeleteTargets(null);
          }}
          onDone={onDeleted}
          onNotice={setNotice}
          onShowFailures={showFailures}
        />
      ) : null}
    </section>
  );
}

function ListError({ error, isArchive, onRetry }: { error: unknown; isArchive: boolean; onRetry: () => void }) {
  const forbidden = classifyApiError(error) === 'forbidden';
  return forbidden ? (
    <ErrorState title={copy.forbiddenTitle} message={copy.forbiddenMessage} />
  ) : (
    <ErrorState
      title={isArchive ? postsCopy.archive.errorTitle : copy.errorTitle}
      message={isArchive ? postsCopy.archive.errorMessage : copy.errorMessage}
      requestId={error instanceof ApiError ? error.requestId : undefined}
      onRetry={onRetry}
    />
  );
}
