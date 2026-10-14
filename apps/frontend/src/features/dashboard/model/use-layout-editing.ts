import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError } from '../../../shared/api/http-client';
import { useToast } from '../../../shared/ui';
import { dashboardLayoutQueryOptions, useSaveDashboardLayout } from '../api/layout-queries';
import { copy } from '../ui/copy';
import { addItem, sameLayout } from './layout-ops';
import { useDashboardLayout } from './use-dashboard-layout';
import { CATALOG, DEFAULT_LAYOUT, toServer, type LayoutItem, type WidgetKind } from './widget-catalog';

/**
 * The Обзор layout and its edit mode. A draft lives only on this screen until «Готово»; the save sends the revision
 * the draft started from, and a 409 keeps the draft with the owner's choice to reload or overwrite.
 */
export function useLayoutEditing() {
  const layout = useDashboardLayout();
  const queryClient = useQueryClient();
  const save = useSaveDashboardLayout();
  const toast = useToast();
  const [draft, setDraft] = useState<LayoutItem[] | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [conflict, setConflict] = useState(false);

  const editing = draft !== null;
  const dirty = draft !== null && !sameLayout(draft, layout.items);

  const finish = () => {
    setDraft(null);
    setConflict(false);
    setAnnouncement('');
  };

  async function submit(items: readonly LayoutItem[], revision: number) {
    try {
      await save.mutateAsync({ revision, widgets: toServer(items) });
      finish();
      toast.show({ tone: 'success', title: copy.edit.saved });
    } catch (error) {
      if (error instanceof ApiError && error.reason === 'STALE_REVISION') {
        setConflict(true);
        return;
      }
      toast.show({
        tone: 'error',
        title: copy.edit.saveError,
        description: error instanceof Error ? error.message : ''
      });
    }
  }

  return {
    items: draft ?? layout.items,
    editing,
    dirty,
    conflict,
    saving: save.isPending,
    announcement,
    /** The server has not answered yet: a save would have no revision to start from. */
    canEdit: layout.revision !== undefined,
    start: () => setDraft([...layout.items]),
    change: (items: LayoutItem[], message: string) => {
      setDraft(items);
      setAnnouncement(message);
    },
    add: (kind: WidgetKind) => {
      setDraft((current) => addItem(current ?? layout.items, kind));
      setAnnouncement(copy.edit.added(CATALOG[kind].title));
    },
    reset: () => setDraft([...DEFAULT_LAYOUT]),
    cancel: finish,
    done: () => {
      if (draft === null || layout.revision === undefined) return;
      if (!dirty) {
        finish();
        return;
      }
      void submit(draft, layout.revision);
    },
    /** 409: drop the draft and show what the other window saved. */
    reload: () => {
      void queryClient.invalidateQueries({ queryKey: dashboardLayoutQueryOptions().queryKey });
      finish();
    },
    /** 409: save this draft over the newer layout. */
    keepMine: async () => {
      if (draft === null) return;
      const fresh = await queryClient.fetchQuery({ ...dashboardLayoutQueryOptions(), staleTime: 0 });
      setConflict(false);
      await submit(draft, fresh.revision);
    }
  };
}
