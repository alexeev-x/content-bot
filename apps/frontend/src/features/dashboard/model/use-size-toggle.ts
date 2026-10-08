import type { DashboardWidget } from '@alexeev/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError } from '../../../shared/api/http-client';
import { useToast } from '../../../shared/ui';
import { dashboardLayoutQueryOptions, useSaveDashboardLayout } from '../api/layout-queries';
import { copy } from '../ui/copy';
import { layoutProblem, resizeTo } from './layout-ops';
import { toggleTarget } from './size-toggle';

type Props = { current: readonly DashboardWidget[]; revision: number | undefined };

/**
 * Small <-> large without the edit mode. Nothing is optimistic: the PUT carries the loaded revision and the widget
 * changes size only with the server's answer, so a 409 or a 400 leaves it exactly where it was.
 */
export function useSizeToggle({ current, revision }: Props) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const save = useSaveDashboardLayout();
  const [conflict, setConflict] = useState(false);

  const toggle = async (id: string) => {
    const item = current.find((widget) => widget.id === id);
    if (!item || revision === undefined || save.isPending) return;
    const next = resizeTo(current, id, toggleTarget(item));
    const problem = layoutProblem(next);
    if (problem) {
      toast.show({ title: copy.edit.saveFailedTitle, description: copy.edit.reasons[problem], tone: 'error' });
      return;
    }
    try {
      await save.mutateAsync({ revision, widgets: next });
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setConflict(true);
        return;
      }
      const reason = error instanceof ApiError && error.status === 400 ? error.details?.['reason'] : undefined;
      const known = reason === 'OUT_OF_GRID' || reason === 'WIDGETS_OVERLAP' || reason === 'DUPLICATE_WIDGET_ID';
      toast.show({
        title: copy.edit.saveFailedTitle,
        description: known ? copy.edit.reasons[reason] : copy.edit.saveFailedMessage,
        tone: 'error'
      });
    }
  };

  /** 409: take the other window's layout; the toggle is not repeated. */
  const reload = async () => {
    try {
      await queryClient.fetchQuery({ ...dashboardLayoutQueryOptions(), staleTime: 0 });
      setConflict(false);
    } catch {
      toast.show({ title: copy.edit.reloadFailed, tone: 'error' });
    }
  };

  return { toggle, pending: save.isPending, conflict, reload };
}
