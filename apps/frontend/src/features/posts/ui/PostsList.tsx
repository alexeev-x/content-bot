import type { PostDto, PostDeleteRefusal, PostRestoreRefusal } from '@alexeev/contracts';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { classifyApiError } from '../../../shared/api/error-kind';
import { ApiError } from '../../../shared/api/http-client';
import {
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
  TableSearch,
  Select,
  SelectionBar,
  Tab,
  TabList,
  Tabs,
  useMediaQuery,
  useRowSearch
} from '../../../shared/ui';
import type { RowSelection, SelectOption } from '../../../shared/ui';
import { ru } from '../../../shared/lib/ru';
import { postsInfiniteQueryOptions } from '../api/posts-queries';
import { refusalText, type LifecycleNotice } from '../model/lifecycle-notices';
import { deleteBlockOf } from '../model/post-state';
import { sortPosts, type PostSort, type PostSortKey, type SortDirection } from '../model/post-sort';
import { useNow } from '../model/use-now';
import { useRestoreActions } from '../model/use-restore';
import { useSelection } from '../model/use-selection';
import { postsCopy } from './copy';
import { deleteTargetOf, DeletePostsDialog, type DeleteOutcome, type DeleteTarget } from './DeletePostsDialog';
import { LifecycleBanner } from './LifecycleBanner';
import { PostRows, type RowAction } from './PostRows';
import styles from './PostsList.module.css';
import { postRowText } from './row-text';

export type PostsView = 'all' | 'drafts' | 'archive';

type Props = {
  view: PostsView;
  onViewChange: (view: PostsView) => void;
  onOpen: (id: string) => void;
  onCreate: () => void;
  /** Opens the reconciliation of this post's `unknown` publication (the page resolves which one). */
  onReconcile: (postId: string) => void;
};

const copy = postsCopy.list;
const NARROW = '(max-width: 859px)';
const VIEWS: readonly PostsView[] = ['all', 'drafts', 'archive'];
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

export function PostsList({ view, onViewChange, onOpen, onCreate, onReconcile }: Props) {
  const now = useNow();
  const narrow = useMediaQuery(NARROW);
  const rootRef = useRef<HTMLElement>(null);
  const focusAfter = useRef<string | null>(null);
  const firstFailed = useRef<string | null>(null);
  const isArchive = view === 'archive';
  // The search covers the loaded rows only and is not carried across tabs.
  const [query, setQuery] = useState('');
  const result = useInfiniteQuery(postsInfiniteQueryOptions(filtersFor(view)));
  const loaded = useMemo(() => result.data?.pages.flatMap((page) => page.items) ?? [], [result.data]);
  const textOf = useCallback((post: PostDto) => postRowText(post, now), [now]);
  const rows = useRowSearch(loaded, textOf, query);
  const isSearching = query.trim() !== '';
  // An empty «Черновики» tab reads as a narrowed list (with a way back to «Все»), not as «no posts at all».
  const emptyIsFiltered = isSearching || view === 'drafts';

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
  const clearSearch = () => setQuery('');
  const showAll = () => {
    clearSelection();
    setQuery('');
    onViewChange('all');
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

  // Phone: the sheet holds only the sort (search is the field above); desktop sorts by the column headers.
  const [sheetOpen, setSheetOpen] = useState(false);
  const [draftSort, setDraftSort] = useState('none');
  const sortLabel = sortOptions.find((option) => option.id === sortValue)?.label ?? copy.filters.sortDefault;
  const columnLabel = sortOptions.find((option) => option.id === `${sort?.key}:ascending`)?.label.split(' — ')[0];
  const sortShort = sort && columnLabel ? `${columnLabel} ${sort.direction === 'ascending' ? '↑' : '↓'}` : '';

  const panelAction = selectMode ? (
    <Button variant="ghost" size="sm" onPress={clearSelection}>
      {postsCopy.selection.done}
    </Button>
  ) : (
    <>
      {ready && hasRows ? (
        <Button variant="ghost" size="sm" icon="check-circle" onPress={() => setSelectMode(true)}>
          {postsCopy.selection.select}
        </Button>
      ) : null}
      {/* Desktop: an always-visible field, not a popover behind an icon (owner, 08.10.2026). */}
      {narrow ? null : (
        <span className={styles.headerSearch}>
          <SearchField
            label={copy.searchLabel}
            placeholder={copy.filters.searchHint}
            value={query}
            isDisabled={result.isPending}
            onChange={setQuery}
          />
        </span>
      )}
    </>
  );

  const loadedText = [
    copy.loaded(loaded.length, result.hasNextPage),
    sort && result.hasNextPage ? copy.sortLoadedOnly : null,
    isSearching && result.hasNextPage ? copy.searchScope : null
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
          setQuery('');
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
        <Wrap narrow={narrow}>
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
                    onChange={setQuery}
                  />
                </PhoneToolbarSearch>
                <FilterButton
                  count={0}
                  sort={{ label: copy.filters.sort, value: sortShort, spoken: sortLabel }}
                  isDisabled={result.isPending}
                  onPress={() => {
                    setDraftSort(sortValue);
                    setSheetOpen(true);
                  }}
                />
              </PhoneToolbar>
            ) : null}
            {ready && !hasRows ? (
              <EmptyState
                icon={emptyIsFiltered ? 'search' : isArchive ? 'clock' : 'file'}
                title={
                  isSearching ? copy.searchEmptyTitle : emptyIsFiltered ? copy.filteredEmptyTitle : copyFor.emptyTitle
                }
                description={
                  isSearching
                    ? copy.searchEmptyDescription
                    : emptyIsFiltered
                      ? copy.filteredEmptyDescription
                      : copyFor.emptyDescription
                }
                action={
                  isSearching ? (
                    <Button variant="secondary" onPress={clearSearch}>
                      {ru.ui.clearSearch}
                    </Button>
                  ) : emptyIsFiltered ? (
                    <Button variant="secondary" onPress={showAll}>
                      {copy.showAll}
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
                onOpen={onOpen}
                onAction={onAction}
              />
            )}
          </Panel>
        </Wrap>
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
        count={0}
        title={copy.filters.sort}
        onReset={() => setDraftSort('none')}
        onApply={() => {
          onMobileSortChange(draftSort);
          setSheetOpen(false);
        }}
      >
        <Select label={ru.ui.sortBy} options={sortOptions} value={draftSort} onChange={setDraftSort} />
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

/** Desktop only: the field in the panel header and the table below it share the Arrow Down shortcut. */
function Wrap({ narrow, children }: { narrow: boolean; children: ReactNode }) {
  return narrow ? <>{children}</> : <TableSearch>{children}</TableSearch>;
}
