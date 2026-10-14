import { useNavigate } from '@tanstack/react-router';
import type { PostDto } from '@alexeev/contracts';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { classifyApiError } from '../../../shared/api/error-kind';
import { ApiError } from '../../../shared/api/http-client';
import {
  ActiveFilters,
  Button,
  EmptyState,
  ErrorState,
  FilterButton,
  SortSheet,
  Pagination,
  Panel,
  PhoneToolbar,
  PhoneToolbarSearch,
  SearchField,
  TableSearch,
  SelectionBar,
  StaleRegion,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  useMediaQuery
} from '../../../shared/ui';
import type { SelectOption } from '../../../shared/ui';
import { ru } from '../../../shared/lib/ru';
import { PAGE_SIZE } from '../../../shared/api/page-query';
import { useTabSwitch } from '../../../shared/api/use-tab-switch';
import {
  postsPageQueryOptions,
  useDuplicatePost,
  usePrefetchPostTabs,
  useReturnPostToDraft
} from '../api/posts-queries';
import { describeLifecycleError, type LifecycleNotice } from '../model/lifecycle-notices';
import type { PostSortKey, SortDirection } from '../model/post-sort';
import { useNow } from '../../../shared/lib/use-now';
import { rowTarget, usePostsSelection } from '../model/use-posts-selection';
import { postsCopy } from './copy';
import { deleteTargetOf, DeletePostsDialog, type DeleteOutcome, type DeleteTarget } from './DeletePostsDialog';
import { LifecycleBanner } from './LifecycleBanner';
import { PostRows, type RowAction } from './PostRows';
import styles from './PostsList.module.css';

export type PostsView = 'all' | 'drafts' | 'archive';
export type PostsSort = { key: 'title' | 'updated' | 'sentAt' | 'left'; direction: SortDirection } | null;

type Props = {
  view: PostsView;
  query: string;
  sort: PostsSort;
  page: number;
  onPageChange: (page: number) => void;
  onViewChange: (view: PostsView) => void;
  onQueryChange: (query: string) => void;
  onSortChange: (sort: PostsSort) => void;
  onOpen: (id: string) => void;
  onCreate: () => void;
  /** Opens the reconciliation of this post's `unknown` publication (the page resolves which one). */
  onReconcile: (postId: string) => void;
};

const copy = postsCopy.list;
const NARROW = '(max-width: 859px)';
const VIEWS: readonly PostsView[] = ['all', 'drafts', 'archive'];
const PANEL_TITLE = { all: copy.panel.all, drafts: copy.panel.drafts, archive: copy.panel.archive } as const;

function filtersFor(view: PostsView) {
  if (view === 'archive') return { view: 'archive' } as const;
  return view === 'drafts' ? ({ view: 'live', status: 'draft' } as const) : ({ view: 'live' } as const);
}
// A tab switch clears search and sort, so page 1 without them is exactly what the next tab asks for.
const TAB_FILTERS = VIEWS.map(filtersFor);

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
  sort,
  page,
  onPageChange,
  onViewChange,
  onQueryChange,
  onSortChange,
  onOpen,
  onCreate,
  onReconcile
}: Props) {
  const now = useNow();
  const narrow = useMediaQuery(NARROW);
  const rootRef = useRef<HTMLElement>(null);
  const focusAfter = useRef<string | null>(null);
  usePrefetchPostTabs(TAB_FILTERS);
  // Search and sort are URL-backed; each combination owns a fresh infinite-query page chain.
  const [searchDraft, setSearchDraft] = useState({ query, value: query });
  const searchInput = searchDraft.query === query ? searchDraft.value : query;
  useEffect(() => {
    if (searchInput === query) return;
    const timer = window.setTimeout(() => onQueryChange(searchInput), 250);
    return () => window.clearTimeout(timer);
  }, [onQueryChange, query, searchInput]);
  const updateSearchInput = (value: string) => setSearchDraft({ query, value });
  const normalizedQuery = query.trim();
  const result = useQuery(
    postsPageQueryOptions(
      {
        ...filtersFor(view),
        ...(normalizedQuery ? { q: normalizedQuery } : {}),
        ...(sort ? { sort: sort.key as 'title' | 'updated' | 'sentAt' | 'left', direction: sort.direction } : {})
      },
      page
    )
  );
  // While another tab loads, the rows of the previous tab stay (dimmed, inert) and the table keeps its own mode.
  const { switching, shownScope } = useTabSwitch(view, result.isPlaceholderData);
  const shownView = shownScope as PostsView;
  const isArchive = shownView === 'archive';
  const loaded = useMemo(() => result.data?.items ?? [], [result.data]);
  const rows = loaded;
  // A typed search is waiting out its debounce or its request: rows stay, the footer says so.
  const isSearchSettling = searchInput !== query || (result.isPlaceholderData && result.isFetching);
  const isSearching = normalizedQuery !== '';
  // An empty «Черновики» tab reads as a narrowed list (with a way back to «Все»), not as «no posts at all».
  const emptyIsFiltered = isSearching || shownView === 'drafts';

  const sortedRows = rows;
  const sortOptions = useMemo(() => sortOptionsFor(shownView), [shownView]);
  const sortValue = sort ? `${sort.key}:${sort.direction}` : 'none';
  const listStateKey = `${normalizedQuery}\u0000${sortValue}`;
  const onMobileSortChange = (value: string) => {
    if (!sortOptions.some((option) => option.id === value)) return;
    if (value === 'none') {
      onSortChange(null);
      return;
    }
    const [key, direction] = value.split(':');
    if (key && direction) {
      onSortChange({ key: key as NonNullable<PostsSort>['key'], direction: direction as SortDirection });
    }
  };

  const [notice, setNotice] = useState<LifecycleNotice | null>(null);
  const {
    selection,
    selectMode,
    setSelectMode,
    selectedPosts,
    selectableRows,
    allState,
    reasonText,
    restore,
    revisionFor,
    recordRefusals,
    clearSelection,
    restoreSelected,
    onTableSelection,
    showFailures
  } = usePostsSelection({ view: shownView, isArchive, rows: sortedRows, listStateKey, rootRef, onNotice: setNotice });
  const [deleteTargets, setDeleteTargets] = useState<DeleteTarget[] | null>(null);

  const returnToDraft = useReturnPostToDraft();
  const navigate = useNavigate();
  const duplicatePost = useDuplicatePost();

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
    if (action === 'publish') {
      void navigate({ to: '/posts/$id/publish', params: { id: post.id } });
      return;
    }
    if (action === 'duplicate') {
      void duplicatePost.mutateAsync(post).then(
        (copyPost) => onOpen(copyPost.id),
        (error: unknown) => {
          setNotice({
            tone: 'error',
            title: postsCopy.actions.duplicateFailed,
            body:
              error instanceof Error && error.message.includes('changed before duplication')
                ? postsCopy.actions.duplicateChanged
                : postsCopy.actions.duplicateFailedBody,
            ...(error instanceof ApiError && error.requestId ? { requestId: error.requestId } : {})
          });
        }
      );
      return;
    }
    if (action === 'return-to-draft') {
      void returnToDraft.mutateAsync({ id: post.id, input: { revision: post.revision } }).then(
        () => {
          setNotice({
            tone: 'info',
            title: postsCopy.lifecycle.returnedToDraft,
            body: postsCopy.lifecycle.returnedToDraftBody
          });
          rowTarget(rootRef.current, post.id)?.focus();
        },
        (error: unknown) => {
          const described = describeLifecycleError(error, 'draft');
          setNotice(described.notice);
          if (error instanceof ApiError && (error.code === 'CONFLICT' || error.code === 'NOT_FOUND')) {
            void result.refetch();
          }
        }
      );
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

  const copyFor = isArchive ? postsCopy.archive : copy;
  const clearSearch = () => updateSearchInput('');
  const showAll = () => {
    clearSelection();
    onViewChange('all');
  };
  const ready = !result.isPending && !result.isError;
  const hasRows = rows.length > 0;
  const noPostsAtAll = ready && loaded.length === 0 && !emptyIsFiltered;

  // Phone: the sheet holds only the sort (search is the field above); desktop sorts by the column headers.
  const [sheetOpen, setSheetOpen] = useState(false);
  const activeFilterCount = sort === null ? 0 : 1;
  const selectedSortLabel = sortOptions.find((option) => option.id === sortValue)?.label ?? copy.filters.sort;
  const phoneSortValue =
    sort === null
      ? copy.filters.sort
      : `${selectedSortLabel.split(' — ')[0]} ${sort.direction === 'ascending' ? '↑' : '↓'}`;

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
            maxLength={120}
            value={searchInput}
            onChange={updateSearchInput}
          />
        </span>
      )}
    </>
  );

  const totalCount = result.data?.totalCount ?? 0;
  // An empty search outside Архив also asks the archive: a published post moved there, and the owner should know.
  const archiveSearch = useQuery({
    ...postsPageQueryOptions({ view: 'archive', q: query.trim() }, 1),
    enabled: isSearching && !isArchive && !result.isPending && !result.isError && totalCount === 0
  });
  const archivedMatches = archiveSearch.data?.totalCount ?? 0;
  const lastPage = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const footer =
    ready && !noPostsAtAll ? (
      <Pagination
        page={page}
        pageSize={PAGE_SIZE}
        totalCount={totalCount}
        onPageChange={(next) => {
          clearSelection();
          onPageChange(next);
        }}
        isSearching={isSearchSettling}
      />
    ) : result.isPending ? (
      <Pagination page={1} pageSize={PAGE_SIZE} totalCount={0} onPageChange={onPageChange} isLoading />
    ) : undefined;
  // A page emptied by deletions falls back to the new last page.
  useEffect(() => {
    if (!result.isPlaceholderData && !result.isPending && !result.isError && page > lastPage) onPageChange(lastPage);
  }, [lastPage, onPageChange, page, result.isError, result.isPending, result.isPlaceholderData]);

  return (
    <section ref={rootRef} className={styles.list}>
      <ActiveFilters
        label={copy.filters.active}
        resetLabel={copy.filters.resetAll}
        onResetAll={() => {
          clearSearch();
          onSortChange(null);
        }}
        filters={[
          ...(isSearching ? [{ id: 'q', label: `Поиск: «${query.trim()}»`, onRemove: clearSearch }] : []),
          ...(sort !== null
            ? [{ id: 'sort', label: `Сортировка: ${selectedSortLabel}`, onRemove: () => onSortChange(null) }]
            : [])
        ]}
      />
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
            </Tab>
          ))}
        </TabList>
        {/* One panel for every tab: the table stays mounted across a switch instead of blinking. */}
        <TabPanel id={view}>
          <>
            {notice ? <LifecycleBanner notice={notice} onDismiss={() => setNotice(null)} /> : null}

            {result.isError ? (
              <ListError error={result.error} isArchive={isArchive} onRetry={() => void result.refetch()} />
            ) : (
              <StaleRegion busy={switching}>
                <Wrap narrow={narrow}>
                  <Panel
                    title={PANEL_TITLE[shownView]}
                    {...(isArchive ? { note: postsCopy.archive.note } : {})}
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
                            maxLength={120}
                            value={searchInput}
                            onChange={updateSearchInput}
                          />
                        </PhoneToolbarSearch>
                        <FilterButton
                          count={activeFilterCount}
                          sort={{
                            label: copy.filters.sort,
                            value: phoneSortValue,
                            spoken: selectedSortLabel
                          }}
                          onPress={() => setSheetOpen(true)}
                        />
                      </PhoneToolbar>
                    ) : null}
                    {ready && !hasRows && totalCount === 0 ? (
                      <EmptyState
                        icon={emptyIsFiltered ? 'search' : isArchive ? 'clock' : 'file'}
                        title={
                          isSearching
                            ? copy.searchEmptyTitle
                            : emptyIsFiltered
                              ? copy.filteredEmptyTitle
                              : copyFor.emptyTitle
                        }
                        description={
                          isSearching
                            ? !isArchive && archivedMatches > 0
                              ? copy.searchFoundInArchive(archivedMatches)
                              : copy.searchEmptyDescription
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
                        onSortChange={(next) =>
                          onSortChange({ key: next.key as NonNullable<PostsSort>['key'], direction: next.direction })
                        }
                        now={now.getTime()}
                        isLoading={result.isPending}
                        narrow={narrow}
                        selectable={selectMode}
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
                        isDuplicating={duplicatePost.isPending}
                      />
                    )}
                  </Panel>
                </Wrap>
              </StaleRegion>
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
          </>
        </TabPanel>
      </Tabs>

      <SortSheet
        isOpen={sheetOpen}
        onOpenChange={setSheetOpen}
        title={copy.filters.sort}
        options={sortOptions}
        value={sortValue}
        onChange={onMobileSortChange}
      />

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

/** Desktop only: the field in the panel header and the table below it share the Arrow Down shortcut. */
function Wrap({ narrow, children }: { narrow: boolean; children: ReactNode }) {
  return narrow ? <>{children}</> : <TableSearch>{children}</TableSearch>;
}
