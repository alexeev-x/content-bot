import type { PostDeleteRefusal, PostDto } from '@alexeev/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Banner, Button, Dialog, useToast } from '../../../shared/ui';
import { postKeys, useBulkDeletePosts, useDeletePost } from '../api/posts-queries';
import { formatExact } from '../model/format-time';
import { describeLifecycleError, type LifecycleNotice } from '../model/lifecycle-notices';
import { nextChannelTitle, pluralPosts, waitingCountOf } from '../model/post-state';
import { postsCopy } from './copy';

export type DeleteTarget = {
  id: string;
  title: string;
  revision: number;
  /** At least one publication was sent: it stays in «Публикации» after the post is deleted. */
  sent: boolean;
  /** Publications that will be cancelled together with the post. */
  waiting: number;
  firstChannel: string | undefined;
  firstAt: string | undefined;
};

export type DeleteOutcome = { deleted: string[]; refused: Map<string, PostDeleteRefusal> };

type Props = {
  targets: readonly DeleteTarget[];
  onOpenChange: (open: boolean) => void;
  /** Called once the server answered (also for a partial bulk result); the dialog closes itself afterwards. */
  onDone: (outcome: DeleteOutcome) => void;
  /** The server state differs from what the owner saw: the page shows this banner and the data is refetched. */
  onNotice: (notice: LifecycleNotice) => void;
  /** Bulk toast action: focus the rows that were not deleted. */
  onShowFailures?: () => void;
};

const copy = postsCopy.deleteDialog;
const lifecycle = postsCopy.lifecycle;

export function deleteTargetOf(post: PostDto): DeleteTarget {
  const next = post.publicationSummary.nextScheduled;
  return {
    id: post.id,
    title: post.title.trim() || postsCopy.list.untitled,
    revision: post.revision,
    sent: post.archivedAt !== null || (post.publicationSummary.counts.sent ?? 0) > 0,
    waiting: waitingCountOf(post),
    firstChannel: nextChannelTitle(post),
    firstAt: next?.scheduledAt
  };
}

function describe(targets: readonly DeleteTarget[]): string {
  const waiting = targets.reduce((sum, target) => sum + target.waiting, 0);
  const parts: string[] = [];
  if (targets.length === 1) {
    const only = targets[0]!;
    if (waiting > 0) {
      parts.push(copy.cancelling(waiting));
      if (only.firstAt) parts.push(copy.cancellingFirst(only.firstChannel, formatExact(only.firstAt)));
      if (only.sent) parts.push(copy.publicationsKept);
      parts.push(copy.channelsKept);
    } else {
      parts.push(only.sent ? copy.withRecords : copy.plain, copy.channelsKept);
    }
    return parts.join(' ');
  }
  if (waiting > 0) parts.push(copy.cancelling(waiting));
  else if (targets.some((target) => target.sent)) parts.push(copy.recordsMany);
  parts.push(copy.channelsKept, copy.irreversible);
  return parts.join(' ');
}

/**
 * Confirmation for deleting one or many posts (alertdialog, the safe answer has the initial focus). It always says
 * that channel messages stay. Nothing is optimistic: the dialog stays with a spinner until the server answers.
 */
export function DeletePostsDialog({ targets, onOpenChange, onDone, onNotice, onShowFailures }: Props) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const single = useDeletePost();
  const bulk = useBulkDeletePosts();
  const [failure, setFailure] = useState<LifecycleNotice | null>(null);
  const isPending = single.isPending || bulk.isPending;
  const count = pluralPosts(targets.length);

  function stateChanged(notice: LifecycleNotice) {
    // Keep what the owner sees honest: refetch, then explain on the page.
    void queryClient.invalidateQueries({ queryKey: postKeys.all });
    onNotice(notice);
    onOpenChange(false);
  }

  async function confirm() {
    if (isPending) return;
    setFailure(null);
    try {
      if (targets.length === 1) {
        const only = targets[0]!;
        await single.mutateAsync({ id: only.id, input: { revision: only.revision } });
        toast.show({ tone: 'success', title: lifecycle.deleted(only.title) });
        onDone({ deleted: [only.id], refused: new Map() });
      } else {
        const result = await bulk.mutateAsync({ items: targets.map(({ id, revision }) => ({ id, revision })) });
        const deleted: string[] = [];
        const refused = new Map<string, PostDeleteRefusal>();
        for (const item of result.items) {
          if (item.outcome === 'deleted') deleted.push(item.id);
          else refused.set(item.id, item.reason);
        }
        const failed = refused.size;
        if (failed === 0) {
          toast.show({ tone: 'success', title: lifecycle.deletedAll(deleted.length) });
        } else {
          toast.show({
            tone: 'error',
            title:
              deleted.length === 0
                ? lifecycle.deletedNone(failed)
                : lifecycle.deletedSome(deleted.length, targets.length, failed),
            ...(onShowFailures ? { action: { label: lifecycle.show, onPress: onShowFailures } } : {})
          });
        }
        onDone({ deleted, refused });
      }
      onOpenChange(false);
    } catch (error) {
      const described = describeLifecycleError(error, 'delete');
      if (described.kind === 'state') stateChanged(described.notice);
      else setFailure(described.notice);
    }
  }

  const title = targets.length === 1 ? copy.titleOne(targets[0]!.title) : copy.titleMany(count);
  return (
    <Dialog
      isOpen
      onOpenChange={(open) => {
        if (!isPending) onOpenChange(open);
      }}
      role="alertdialog"
      title={title}
      description={describe(targets)}
      footer={
        <>
          {/* Intentional: the safe answer takes initial focus in a destructive confirmation (skill ui-patterns). */}
          {/* oxlint-disable-next-line jsx-a11y/no-autofocus */}
          <Button variant="secondary" autoFocus isDisabled={isPending} onPress={() => onOpenChange(false)}>
            {copy.keep}
          </Button>
          <Button variant="danger" isLoading={isPending} onPress={() => void confirm()}>
            {isPending ? copy.pending : targets.length === 1 ? copy.confirmOne : copy.confirmMany(count)}
          </Button>
        </>
      }
    >
      {failure ? (
        <Banner
          tone="error"
          title={failure.title}
          action={
            <Button size="sm" variant="secondary" icon="retry" isDisabled={isPending} onPress={() => void confirm()}>
              {copy.retry}
            </Button>
          }
        >
          {failure.body}
          {failure.requestId ? (
            <>
              {' '}
              {lifecycle.notices.requestId}: <code>{failure.requestId}</code>
            </>
          ) : null}
        </Banner>
      ) : null}
    </Dialog>
  );
}
