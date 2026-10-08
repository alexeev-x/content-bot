import type { PostDto, PostDeleteRefusal, PostRestoreRefusal } from '@alexeev/contracts';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { classifyApiError } from '../../../shared/api/error-kind';
import { ApiError } from '../../../shared/api/http-client';
import {
  AppliedChips,
  Button,
  EmptyState,
  ErrorState,
  FilterButton,
  FilterSheet,
  FooterLine,
  Panel,
  PhoneToolbar,
  PhoneToolbarSearch,
  SearchField,
  Select,
  SelectionBar,
  Tab,
  TabList,
  Tabs,
  useMediaQuery
} from '../../../shared/ui';
import type { FilterChip, RowSelection, SelectOption } from '../../../shared/ui';
import { ru } from '../../../shared/lib/ru';
import { postsInfiniteQueryOptions } from '../api/posts-queries';
import { filterPostsByText } from '../model/excerpt';
import { refusalText, type LifecycleNotice } from '../model/lifecycle-notices';
import { deleteBlockOf, listStateOf } from '../model/post-state';
import { sortPosts, type PostSort, type PostSortKey, type SortDirection } from '../model/post-sort';
import { useNow } from '../model/use-now';
import { useRestoreActions } from '../model/use-restore';
import { useSelection } from '../model/use-selection';
import { postsCopy } from './copy';
import { deleteTargetOf, DeletePostsDialog, type DeleteOutcome, type DeleteTarget } from './DeletePostsDialog';
import { LifecycleBanner } from './LifecycleBanner';
import { PostRows, type RowAction, type StatusOption } from './PostRows';
import styles from './PostsList.module.css';

export type PostsView = 'all' | 'drafts' | 'archive';

type Props = {
  view: PostsView;
  query: string;
  /** `all` or a list state (`draft`, `approved`, `scheduled`, `sending`, `unknown`); kept in the URL by the route. */
  status: string;
  onViewChange: (view: PostsView) => void;
  onQueryChange: (query: string) => void;
  onStatusChange: (status: string) => void;
  onOpen: (id: string) => void;
  onCreate: () => void;
  /** Opens the reconciliation of this post's `unknown` publication (the page resolves which one). */
  onReconcile: (postId: string) => void;
};

const copy = postsCopy.list;
const NARROW = '(max-width: 859px)';
const VIEWS: readonly PostsView[] = ['all', 'drafts', 'archive'];
const STATUS_OPTIONS: readonly StatusOption[] = [
  { id: 'all', label: copy.filters.all },
  { id: 'draft', label: copy.state.draft },
  { id: 'approved', label: copy.state.approved },
  { id: 'scheduled', label: copy.state.scheduled },
  { id: 'sending', label: copy.state.sending },
  { id: 'unknown', label: copy.state.unknown }
];
const PANEL_TITLE = { all: copy.panel.all, drafts: copy.panel.drafts, archive: copy.panel.archive } as const;

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
          { key: 'sentAt', label: postsCopy.archive.columns.sentAt },
          { key: 'left', label: postsCopy.archive.columns.left }
        ]
      : [
          { key: 'title', label: copy.columns.title },
          { key: 'updated', label: copy.columns.updated }
        ];
  return [
    { id: 'none', label: copy.filters.sortDefault },
    ...columns.flatMap(({ key, label }) => [
      { id: `${key}:ascending`, label: `${label} — ${ru.ui.sortAsc}` },
      { id: `${key}:descending`, label: `${label} — ${ru.ui.sortDesc}` }
    ])
  ];
}

export function PostsList({
  view,
  query,
  status,
  onViewChange,
  onQueryChange,
  onStatusChange,
  onOpen,
  onCreate,
  onReconcile
}: Props) {
  const now = useNow();
  const narrow = useMediaQuery(NARROW);
  const rootRef = useRef<HTMLElement>(null);
  const focusAfter = useRef<string | null>(null);
  const firstFailed = useRef<string | null>(null);
  const isArchive = view === 'archive';
  const result = useInfiniteQuery(postsInfiniteQueryOptions(filtersFor(view)));
  const loaded = useMemo(() => result.data?.pages.flatMap((page) => page.items) ?? [], [result.data]);
  // The status filter exists only where the status varies (the «Все» tab); a stale URL value is ignored elsewhere.
  const activeStatus = view === 'all' ? status : 'all';
  const rows = useMemo(
    () =>
      filterPostsByText(loaded, query).filter(
        (post) => activeStatus === 'all' || listStateOf(post).kind === activeStatus
      ),
    [loaded, query, activeStatus]
  );
  const isFiltered = query.trim() !== '' || activeStatus !== 'all';
  // An empty «Черновики» tab reads as a narrowed list (with a way back to «Все»), not as «no posts at all».
  const emptyIsFiltered = isFiltered || view === 'drafts';

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
  const onSortChange = (next: NonNullable<PostSort>) => setSortState({ view, sort: next });
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
    const target = id ? rowTarget(rootRef.current, id) : null;
    target?.scrollIntoView({ block: 'center' });
    target?.focus();
  };
  const restore = useRestoreActions({ onNotice: setNotice, onShowFailures: showFailures });

  const selectedPosts = useMemo(() => loaded.filter((post) => selection.has(post.id)), [loaded, selection]);
  const selectableRows = useMemo(
    () => sortedRows.filter((post) => isArchive || deleteBlockOf(post) === null),
    [sortedRows, isArchive]
  );
  const selectedVisible = selectableRows.filter((post) => selection.has(post.id)).length;
  const allState = selectedVisible === 0 ? 'none' : selectedVisible === selectableRows.length ? 'all' : 'some';
  const selectable = selectMode;

  // Shift+click selects a range. The table reports only the new selection, so the key is read from the pointer
  // event that caused it (a document listener, cleaned up).
  const shiftHeld = useRef(false);
  const escapePressed = useRef(false);
  useEffect(() => {
    const track = (event: MouseEvent) => {
      shiftHeld.current = event.shiftKey;
      escapePressed.current = false;
    };
    const trackKey = (event: KeyboardEvent) => {
      escapePressed.current = event.key === 'Escape';
    };
    document.addEventListener('pointerdown', track, true);
    document.addEventListener('keydown', trackKey, true);
    return () => {
      document.removeEventListener('pointerdown', track, true);
      document.removeEventListener('keydown', trackKey, true);
    };
  }, []);

  // After a removal, focus moves to the neighbour (or the previous row when it was last).
  useEffect(() => {
    const id = focusAfter.current;
    if (id === null) return;
    const target = rowTarget(rootRef.current, id);
    if (target) {
      focusAfter.current = null;
      target.focus();
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
    if (refused.size === 0) setSelectMode(false);
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
    if (outcome.refused.size === 0) setSelectMode(false);
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
    clearSelection();
    onViewChange('all');
    onQueryChange('');
    onStatusChange('all');
  };
  const ready = !result.isPending && !result.isError;
  const hasRows = rows.length > 0;
  const noPostsAtAll = ready && loaded.length === 0 && !emptyIsFiltered;

  // The table reports the whole selection; the hook keeps the revision the owner saw for each added row.
  function onTableSelection(next: RowSelection) {
    const wanted = next === 'all' ? new Set(selectableRows.map((post) => post.id)) : next;
    // Esc inside the table clears its selection itself; the list leaves the selection mode with it.
    if (wanted.size === 0 && escapePressed.current) {
      clearSelection();
      return;
    }
    const added = selectableRows.filter((post) => wanted.has(post.id) && !selection.has(post.id));
    const removed = sortedRows.filter((post) => !wanted.has(post.id) && selection.has(post.id));
    const only = added.length === 1 ? added[0] : undefined;
    if (only && shiftHeld.current) {
      selection.selectRange(
        selectableRows.map((row) => ({ id: row.id, revision: row.revision })),
        { id: only.id, revision: only.revision }
      );
    } else if (only) {
      // A single row is a toggle, which also becomes the anchor of the next Shift range.
      selection.toggle({ id: only.id, revision: only.revision }, true);
    } else if (added.length > 0) {
      selection.setAll(added.map((post) => ({ id: post.id, revision: post.revision })));
    }
    if (removed.length > 0) selection.remove(removed.map((post) => post.id));
  }

  // Phone: one sheet for the status and the sort, applied together; desktop uses the column headers.
  const [sheetOpen, setSheetOpen] = useState(false);
  const [draft, setDraft] = useState({ status: 'all', sort: 'none' });
  const filtersCount = (activeStatus !== 'all' ? 1 : 0) + (sort ? 1 : 0);
  const draftCount = (draft.status !== 'all' ? 1 : 0) + (draft.sort !== 'none' ? 1 : 0);
  const chips: FilterChip[] = [
    ...(activeStatus !== 'all'
      ? [
          {
            id: 'status',
            label: `${copy.filters.status}: ${STATUS_OPTIONS.find((option) => option.id === activeStatus)?.label ?? ''}`
          }
        ]
      : []),
    ...(sort ? [{ id: 'sort', label: sortOptions.find((option) => option.id === sortValue)?.label ?? '' }] : [])
  ];
  const removeChip = (id: string) => (id === 'status' ? onStatusChange('all') : onMobileSortChange('none'));
  const rowStatus =
    view === 'all' ? { value: activeStatus, options: STATUS_OPTIONS, onChange: onStatusChange } : undefined;

  const panelAction = selectMode ? (
    <Button variant="ghost" size="sm" onPress={clearSelection}>
      {postsCopy.selection.done}
    </Button>
  ) : (
    <>
      {!narrow && isFiltered ? (
        <Button variant="ghost" size="sm" icon="x" onPress={reset}>
          {copy.resetFilters}
        </Button>
      ) : null}
      {ready && hasRows ? (
        <Button variant="ghost" size="sm" icon="check-circle" onPress={() => setSelectMode(true)}>
          {postsCopy.selection.select}
        </Button>
      ) : null}
    </>
  );

  const loadedText = [
    copy.loaded(loaded.length, result.hasNextPage),
    sort && result.hasNextPage ? copy.sortLoadedOnly : null,
    query.trim() !== '' && result.hasNextPage ? copy.searchScope : null
  ]
    .filter(Boolean)
    .join(' · ');
  const footer = result.isPending ? (
    <FooterLine text={copy.loadingMore} />
  ) : ready && !noPostsAtAll ? (
    <FooterLine
      text={result.isFetchNextPageError ? copy.loadMoreFailed : loadedText}
      action={
        result.hasNextPage ? (
          <Button
            variant="ghost"
            size="sm"
            isLoading={result.isFetchingNextPage}
            onPress={() => void result.fetchNextPage()}
          >
            {result.isFetchingNextPage ? copy.loadingMore : copy.loadMore}
          </Button>
        ) : undefined
      }
    />
  ) : undefined;

  return (
    <section ref={rootRef} className={styles.list}>
      <Tabs
        selectedKey={view}
        onSelectionChange={(key) => {
          clearSelection();
          onViewChange(key as PostsView);
        }}
      >
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
      </Tabs>
      {isArchive ? <p className={styles.note}>{postsCopy.archive.note}</p> : null}
      {notice ? <LifecycleBanner notice={notice} onDismiss={() => setNotice(null)} /> : null}

      {result.isError ? (
        <ListError error={result.error} isArchive={isArchive} onRetry={() => void result.refetch()} />
      ) : (
        <Panel
          title={PANEL_TITLE[view]}
          action={panelAction}
          {...(ready && hasRows ? {} : { reserveRows: narrow ? 6 : 8 })}
          {...(footer ? { footer } : {})}
        >
          {narrow ? (
            <PhoneToolbar>
              <PhoneToolbarSearch>
                <SearchField
                  label={copy.searchLabel}
                  placeholder={copy.filters.phoneSearch}
                  value={query}
                  isDisabled={result.isPending}
                  onChange={onQueryChange}
                />
              </PhoneToolbarSearch>
              <FilterButton
                count={filtersCount}
                isDisabled={result.isPending}
                onPress={() => {
                  setDraft({ status: activeStatus, sort: sortValue });
                  setSheetOpen(true);
                }}
              />
            </PhoneToolbar>
          ) : null}
          {narrow && ready && hasRows ? <AppliedChips chips={chips} onRemove={removeChip} /> : null}
          {ready && !hasRows ? (
            <EmptyState
              icon={emptyIsFiltered ? 'search' : isArchive ? 'clock' : 'file'}
              title={emptyIsFiltered ? copyFor.filteredEmptyTitle : copyFor.emptyTitle}
              description={emptyIsFiltered ? copyFor.filteredEmptyDescription : copyFor.emptyDescription}
              action={
                emptyIsFiltered ? (
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
              onSelectionChange={onTableSelection}
              onToggle={(post, on) => selection.toggle({ id: post.id, revision: post.revision }, on)}
              onToggleAll={(on) =>
                on
                  ? selection.setAll(selectableRows.map((row) => ({ id: row.id, revision: row.revision })))
                  : selection.remove(selectableRows.map((row) => row.id))
              }
              reasons={reasonText}
              query={query}
              onQueryChange={onQueryChange}
              {...(rowStatus ? { status: rowStatus } : {})}
              onOpen={onOpen}
              onAction={onAction}
            />
          )}
        </Panel>
      )}

      {selectedPosts.length > 0 || selectMode ? (
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
              setDeleteTargets(selectedPosts.map((post) => ({ ...deleteTargetOf(post), revision: revisionFor(post) })));
            }}
          >
            {postsCopy.selection.delete}
          </Button>
          <Button variant="ghost" onPress={clearSelection}>
            {postsCopy.selection.clear}
          </Button>
        </SelectionBar>
      ) : null}

      <FilterSheet
        isOpen={sheetOpen}
        onOpenChange={setSheetOpen}
        count={draftCount}
        onReset={() => setDraft({ status: 'all', sort: 'none' })}
        onApply={() => {
          onStatusChange(draft.status);
          onMobileSortChange(draft.sort);
          setSheetOpen(false);
        }}
      >
        {view === 'all' ? (
          <Select
            label={copy.filters.status}
            options={STATUS_OPTIONS}
            value={draft.status}
            onChange={(value) => setDraft({ ...draft, status: value })}
          />
        ) : null}
        <Select
          label={ru.ui.sortBy}
          options={sortOptions}
          value={draft.sort}
          onChange={(value) => setDraft({ ...draft, sort: value })}
        />
      </FilterSheet>

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

/** What takes focus for a post row: the table row on desktop, nothing on a phone (rows there have no stable handle). */
function rowTarget(root: HTMLElement | null, id: string): HTMLElement | null {
  const marker = root?.querySelector<HTMLElement>(`[data-post-id="${id}"]`);
  return marker?.closest<HTMLElement>('[role="row"]') ?? null;
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
