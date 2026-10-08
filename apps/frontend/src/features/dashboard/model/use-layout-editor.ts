import type { DashboardWidget, DashboardWidgetType } from '@alexeev/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';
import { ApiError } from '../../../shared/api/http-client';
import { useToast } from '../../../shared/ui';
import { dashboardLayoutQueryOptions, useSaveDashboardLayout } from '../api/layout-queries';
import { copy } from '../ui/copy';
import { DEFAULT_WIDGETS } from './default-layout';
import {
  add,
  describePlacement,
  layoutProblem,
  dropAt,
  dropTarget,
  moveStep,
  remove,
  resize,
  sameLayout,
  shiftInSequence,
  type Direction,
  type ResizeStep
} from './layout-ops';
import { WIDGETS } from './widget-catalog';

export type WidgetAction =
  'move-left' | 'move-right' | 'move-up' | 'move-down' | 'wider' | 'narrower' | 'taller' | 'shorter' | 'remove';

const MOVES: Record<string, Direction> = {
  'move-left': 'left',
  'move-right': 'right',
  'move-up': 'up',
  'move-down': 'down'
};
const RESIZES: Record<string, ResizeStep> = {
  wider: 'wider',
  narrower: 'narrower',
  taller: 'taller',
  shorter: 'shorter'
};

const UNDO_MS = 8000;

type Props = {
  /** The layout on screen now (server copy, cache or default): what Отмена returns to. */
  current: readonly DashboardWidget[];
  /** Undefined until the server answered: editing is not offered without a revision to save against. */
  revision: number | undefined;
};

const reasonText = (reason: string | undefined): string =>
  reason === 'OUT_OF_GRID' || reason === 'WIDGETS_OVERLAP' || reason === 'DUPLICATE_WIDGET_ID'
    ? copy.edit.reasons[reason]
    : copy.edit.saveFailedMessage;

/**
 * The owner's draft over the saved layout. Nothing is optimistic: the saved layout changes only with the server's
 * answer, and every failed save keeps the draft. A 409 asks the owner to choose; it never overwrites silently.
 */
export function useLayoutEditor({ current, revision }: Props) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const save = useSaveDashboardLayout();
  const [draft, setDraft] = useState<DashboardWidget[] | null>(null);
  const [baseRevision, setBaseRevision] = useState<number | null>(null);
  const [conflict, setConflict] = useState(false);
  const [reloadFailed, setReloadFailed] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [catalogFirst, setCatalogFirst] = useState(false);
  // Each edit session has its own number; an undo toast belongs to the session that raised it.
  const session = useRef(0);

  const editing = draft !== null;
  const isDirty = draft !== null && !sameLayout(draft, current);

  const startEdit = useCallback(
    (options?: { withDefault?: boolean; catalog?: boolean }) => {
      if (revision === undefined) return;
      session.current += 1;
      setCatalogFirst(options?.catalog ?? false);
      setDraft((options?.withDefault ? DEFAULT_WIDGETS : current).map((item) => ({ ...item })));
      setBaseRevision(revision);
      setConflict(false);
      setReloadFailed(false);
      setAnnouncement('');
    },
    [current, revision]
  );

  const close = useCallback(() => {
    session.current += 1;
    setDraft(null);
    setBaseRevision(null);
    setConflict(false);
    setReloadFailed(false);
    setAnnouncement('');
  }, []);

  /** A geometry the grid produced after a drag or a resize. */
  const commit = useCallback((next: readonly DashboardWidget[]) => setDraft(next.map((item) => ({ ...item }))), []);

  const act = useCallback(
    (id: string, action: WidgetAction, phone: boolean) => {
      if (!draft) return;
      const item = draft.find((candidate) => candidate.id === id);
      if (!item) return;
      const title = WIDGETS[item.type].title;
      if (action === 'remove') {
        const mine = session.current;
        setDraft(remove(draft, id, phone));
        setAnnouncement(copy.edit.removed(title));
        toast.show({
          title: copy.edit.removed(title),
          tone: 'info',
          timeout: UNDO_MS,
          action: {
            label: copy.edit.undo,
            onPress: () =>
              setDraft((latest) => {
                if (session.current !== mine || !latest || latest.some((candidate) => candidate.id === id))
                  return latest;
                const free = !latest.some(
                  (other) =>
                    item.x < other.x + other.w &&
                    other.x < item.x + item.w &&
                    item.y < other.y + other.h &&
                    other.y < item.y + item.h
                );
                return free ? [...latest, item] : add(latest, item.type);
              })
          }
        });
        return;
      }
      let next: DashboardWidget[];
      if (phone) next = shiftInSequence(draft, id, action === 'move-up' ? -1 : 1);
      else if (action in MOVES) {
        const step = moveStep(draft, id, MOVES[action] as Direction);
        next = step.widgets;
        const partner = draft.find((candidate) => candidate.id === step.partner);
        if (partner) {
          setDraft(next);
          setAnnouncement(copy.edit.swapped(title, WIDGETS[partner.type].title));
          return;
        }
      } else next = resize(draft, id, RESIZES[action] as ResizeStep);
      setDraft(next);
      const moved = next.find((candidate) => candidate.id === id);
      if (moved) setAnnouncement(`${title}: ${describePlacement(moved)}`);
    },
    [draft, toast]
  );

  /** A pointer drop at grid cell (x, y): onto a widget it swaps places with it, onto free space it moves there. */
  const drop = useCallback(
    (id: string, at: { x: number; y: number }) => {
      if (!draft) return;
      const target = dropTarget(draft, id, at);
      setDraft(dropAt(draft, id, at));
      const a = draft.find((candidate) => candidate.id === id);
      const b = draft.find((candidate) => candidate.id === target);
      if (a && b) setAnnouncement(copy.edit.swapped(WIDGETS[a.type].title, WIDGETS[b.type].title));
    },
    [draft]
  );

  const addWidget = useCallback(
    (type: DashboardWidgetType) => {
      if (!draft || draft.some((item) => item.type === type)) return;
      const next = add(draft, type);
      setDraft(next);
      setAnnouncement(copy.edit.added(WIDGETS[type].title));
    },
    [draft]
  );

  const reset = useCallback(() => {
    setDraft(DEFAULT_WIDGETS.map((item) => ({ ...item })));
    setAnnouncement(copy.edit.resetDone);
  }, []);

  const submit = useCallback(async () => {
    if (!draft || baseRevision === null) return;
    const problem = layoutProblem(draft);
    if (problem) {
      toast.show({ title: copy.edit.saveFailedTitle, description: copy.edit.reasons[problem], tone: 'error' });
      return;
    }
    try {
      await save.mutateAsync({ revision: baseRevision, widgets: draft });
      toast.show({ title: copy.edit.saved, tone: 'success' });
      close();
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setConflict(true);
        return;
      }
      const reason = error instanceof ApiError && error.status === 400 ? error.details?.['reason'] : undefined;
      toast.show({ title: copy.edit.saveFailedTitle, description: reasonText(reason), tone: 'error' });
    }
  }, [draft, baseRevision, save, toast, close]);

  const refetch = useCallback(
    () => queryClient.fetchQuery({ ...dashboardLayoutQueryOptions(), staleTime: 0 }),
    [queryClient]
  );

  /** 409: take the other window's layout and drop the draft (an explicit choice). */
  const reloadFromServer = useCallback(async () => {
    setReloadFailed(false);
    try {
      await refetch();
      close();
    } catch {
      setReloadFailed(true);
    }
  }, [refetch, close]);

  /** 409: keep the draft and base it on the newest revision; the next save replaces the other window's layout. */
  const keepMine = useCallback(async () => {
    setReloadFailed(false);
    try {
      const fresh = await refetch();
      setBaseRevision(fresh.revision);
      setConflict(false);
    } catch {
      setReloadFailed(true);
    }
  }, [refetch]);

  return {
    editing,
    catalogFirst,
    draft,
    isDirty,
    isSaving: save.isPending,
    conflict,
    reloadFailed,
    announcement,
    startEdit,
    discard: close,
    commit,
    drop,
    act,
    addWidget,
    reset,
    submit,
    reloadFromServer,
    keepMine
  };
}
