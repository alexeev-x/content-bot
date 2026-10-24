import type { PostDeleteRefusal, PostDto, PostRestoreRefusal } from '@alexeev/contracts';
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { RowSelection } from '../../../shared/ui';
import type { LifecycleNotice } from './lifecycle-notices';
import { refusalText } from './lifecycle-notices';
import { deleteBlockOf } from './post-state';
import { useRestoreActions } from './use-restore';
import { useSelection } from './use-selection';

type Reason = { reason: PostDeleteRefusal | PostRestoreRefusal; text: string };

type Options = {
  view: string;
  isArchive: boolean;
  /** The rows on screen, in display order. */
  rows: PostDto[];
  /** Changes when the search or sort changes: the selection does not survive it. */
  listStateKey: string;
  rootRef: RefObject<HTMLElement | null>;
  onNotice: (notice: LifecycleNotice | null) => void;
};

/** What takes focus for a post row: the table row on desktop, nothing on a phone (rows there have no stable handle). */
export function rowTarget(root: HTMLElement | null, id: string): HTMLElement | null {
  const marker = root?.querySelector<HTMLElement>(`[data-post-id="${id}"]`);
  return marker?.closest<HTMLElement>('[role="row"]') ?? null;
}

/** Selection mode, the table's selection events, refusal reasons per row and the bulk restore of the posts list. */
export function usePostsSelection({ view, isArchive, rows, listStateKey, rootRef, onNotice }: Options) {
  const selection = useSelection(view);
  const [selectMode, setSelectMode] = useState(false);
  const previousListState = useRef(listStateKey);
  const firstFailed = useRef<string | null>(null);
  const [reasonState, setReasonState] = useState<{ view: string; map: ReadonlyMap<string, Reason> }>({
    view,
    map: new Map()
  });
  const reasons = reasonState.view === view ? reasonState.map : new Map<string, Reason>();

  useEffect(() => {
    if (previousListState.current === listStateKey) return;
    previousListState.current = listStateKey;
    selection.clear();
    setSelectMode(false);
  }, [listStateKey, selection]);

  const showFailures = () => {
    const id = firstFailed.current;
    const target = id ? rowTarget(rootRef.current, id) : null;
    target?.scrollIntoView({ block: 'center' });
    target?.focus();
  };
  const restore = useRestoreActions({ onNotice, onShowFailures: showFailures });

  const selectedPosts = useMemo(() => rows.filter((post) => selection.has(post.id)), [rows, selection]);
  const selectableRows = useMemo(
    () => rows.filter((post) => isArchive || deleteBlockOf(post) === null),
    [rows, isArchive]
  );
  const selectedVisible = selectableRows.filter((post) => selection.has(post.id)).length;
  const allState: 'none' | 'some' | 'all' =
    selectedVisible === 0 ? 'none' : selectedVisible === selectableRows.length ? 'all' : 'some';

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

  async function restoreSelected() {
    onNotice(null);
    const outcome = await restore.restoreMany(
      selectedPosts.map((post) => ({ id: post.id, revision: revisionFor(post) }))
    );
    if (!outcome) return;
    selection.remove(outcome.restored);
    recordRefusals(outcome.refused);
    if (outcome.refused.size === 0) setSelectMode(false);
  }

  // The table reports the whole selection; the hook keeps the revision the owner saw for each added row.
  function onTableSelection(next: RowSelection) {
    const wanted = next === 'all' ? new Set(selectableRows.map((post) => post.id)) : next;
    // Esc inside the table clears its selection itself; the list leaves the selection mode with it.
    if (wanted.size === 0 && escapePressed.current) {
      clearSelection();
      return;
    }
    const added = selectableRows.filter((post) => wanted.has(post.id) && !selection.has(post.id));
    const removed = rows.filter((post) => !wanted.has(post.id) && selection.has(post.id));
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

  const reasonText = useMemo(() => new Map([...reasons].map(([id, item]) => [id, item.text])), [reasons]);

  return {
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
  };
}
