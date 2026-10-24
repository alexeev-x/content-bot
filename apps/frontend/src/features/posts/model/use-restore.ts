import type { PostRef, PostRestoreRefusal } from '@alexeev/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '../../../shared/ui';
import { postKeys, useBulkRestorePosts, useRestorePost } from '../api/posts-queries';
import { postsCopy } from '../ui/copy';
import { describeLifecycleError, type LifecycleNotice } from './lifecycle-notices';

const copy = postsCopy.lifecycle;

export type RestoreOutcome = { restored: string[]; refused: Map<string, PostRestoreRefusal> };

type Options = {
  /** A refusal or failure stays on the page as a banner; the data is refetched when the state moved. */
  onNotice: (notice: LifecycleNotice) => void;
  onShowFailures?: (() => void) | undefined;
};

/** Restoring sends nothing and is reversible, so it needs no confirmation; the result is still only what the server says. */
export function useRestoreActions({ onNotice, onShowFailures }: Options) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const one = useRestorePost();
  const many = useBulkRestorePosts();

  function failed(error: unknown) {
    const described = describeLifecycleError(error, 'restore');
    if (described.kind === 'state') void queryClient.invalidateQueries({ queryKey: postKeys.all });
    onNotice(described.notice);
  }

  async function restoreOne(ref: PostRef): Promise<boolean> {
    if (one.isPending) return false;
    try {
      await one.mutateAsync({ id: ref.id, input: { revision: ref.revision } });
      toast.show({ tone: 'success', title: copy.restored });
      return true;
    } catch (error) {
      failed(error);
      return false;
    }
  }

  async function restoreMany(refs: readonly PostRef[]): Promise<RestoreOutcome | null> {
    if (many.isPending) return null;
    try {
      const result = await many.mutateAsync({ items: refs.map(({ id, revision }) => ({ id, revision })) });
      const restored: string[] = [];
      const refused = new Map<string, PostRestoreRefusal>();
      for (const item of result.items) {
        if (item.outcome === 'restored') restored.push(item.id);
        else refused.set(item.id, item.reason);
      }
      if (refused.size === 0) toast.show({ tone: 'success', title: copy.restoredAll(restored.length) });
      else {
        toast.show({
          tone: 'error',
          title:
            restored.length === 0
              ? copy.restoredNone(refused.size)
              : copy.restoredSome(restored.length, refs.length, refused.size),
          ...(onShowFailures ? { action: { label: copy.show, onPress: onShowFailures } } : {})
        });
      }
      return { restored, refused };
    } catch (error) {
      failed(error);
      return null;
    }
  }

  return { restoreOne, restoreMany, isPending: one.isPending || many.isPending };
}
