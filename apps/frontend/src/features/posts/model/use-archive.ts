import type { PostRef } from '@alexeev/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '../../../shared/ui';
import { postKeys, useArchivePost } from '../api/posts-queries';
import { postsCopy } from '../ui/copy';
import { describeLifecycleError, type LifecycleNotice } from './lifecycle-notices';

type Options = {
  onNotice: (notice: LifecycleNotice) => void;
};

/** Manual archive is reversible but never cancels active publication work. */
export function useArchiveAction({ onNotice }: Options) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const archive = useArchivePost();

  async function archiveOne(ref: PostRef): Promise<boolean> {
    if (archive.isPending) return false;
    try {
      await archive.mutateAsync({ id: ref.id, input: { revision: ref.revision } });
      toast.show({ tone: 'success', title: postsCopy.lifecycle.archived });
      return true;
    } catch (error) {
      const described = describeLifecycleError(error, 'archive');
      if (described.kind === 'state') void queryClient.invalidateQueries({ queryKey: postKeys.all });
      onNotice(described.notice);
      return false;
    }
  }

  return { archiveOne, isPending: archive.isPending };
}
