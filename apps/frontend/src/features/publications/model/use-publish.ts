import type { PostDto, PublicationDto } from '@alexeev/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ru } from '../../../shared/lib/ru';
import { useToast } from '../../../shared/ui';
import { publicationsPageQueryOptions, useSubmitPublication } from '../api/publications-queries';
import { copy } from '../ui/copy';
import { browserTimeZone, formatWithZone } from './format-time';
import { describeActionError, type ActionError } from './publication-errors';
import { displayStatus } from './publication-view';
import type { PublishFormValues } from './publish-form';
import {
  clearIntent,
  createIntentMemory,
  findIntent,
  INTENT_TRUSTED_MS,
  isDefinitive,
  newIntent,
  saveIntent,
  type PublishIntent
} from './publish-intent';

/** Only these can be in (or on the way to) the channel; a failed or cancelled attempt must not block «Отправить снова». */
const MAY_REACH_CHANNEL: ReadonlySet<PublicationDto['status']> = new Set([
  'scheduled',
  'queued',
  'preparing',
  'sending',
  'sent',
  'retry_wait',
  'unknown'
]);

type Options = {
  onPublished?: (publication: PublicationDto) => void;
  /** Called after a success or a failure the owner has been told about; the dialog uses it to close. */
  onSettled?: () => void;
  /** A failure is shown as a banner when this returns true, otherwise as a toast. Defaults to the toast. */
  canShowBanner?: () => boolean;
};

/**
 * The whole publish flow: intent memory (same key and instant on retry), duplicate check, one send, outcome toasts.
 * Nothing is optimistic: the toast shows the status the server returned.
 */
export function usePublish(post: PostDto, timezone: string | undefined, options: Options = {}) {
  const zone = timezone ?? browserTimeZone();
  const toast = useToast();
  const queryClient = useQueryClient();
  const create = useSubmitPublication();
  const [memory] = useState(createIntentMemory);
  const [failure, setFailure] = useState<{ error: ActionError; revision: number } | null>(null);
  const [duplicate, setDuplicate] = useState<PublishFormValues | null>(null);
  const [staleIntent, setStaleIntent] = useState<PublishIntent | null>(null);
  const isApproved = post.status === 'approved';

  /** A request that may have reached the server is retried exactly as sent (same key, same instant), whatever the delay. */
  const findPending = (destinationId: string | undefined, target: PostDto = post) =>
    findIntent(memory, target.id, target.revision, destinationId || undefined);

  async function send(intent: PublishIntent, target: PostDto = post) {
    if (create.isPending || target.status !== 'approved') return;
    setFailure(null);
    // Saved before the request: if the answer is lost, a remount or reload still finds the same intent.
    saveIntent(memory, intent);
    try {
      const created = await create.mutateAsync({
        input: {
          postId: intent.postId,
          revision: intent.revision,
          destinationId: intent.destinationId,
          scheduledAt: intent.scheduledAt,
          timezone: intent.timezone
        },
        key: intent.key
      });
      clearIntent(memory, intent);
      // 202 only means "accepted": the label is whatever status the server returned, never «Опубликовано» by default.
      const shown = displayStatus(created);
      toast.show({
        tone: shown === 'scheduled' || shown === 'queued' ? 'success' : 'info',
        title: ru.status[shown],
        description:
          intent.mode === 'later'
            ? copy.publish.toastBody(formatWithZone(created.scheduledAt, zone))
            : copy.publish.toastOther
      });
      options.onSettled?.();
      options.onPublished?.(created);
    } catch (error) {
      if (isDefinitive(error)) clearIntent(memory, intent);
      const described = describeActionError(error, 'create');
      setFailure({ error: described, revision: target.revision });
      // A closed dialog cannot show the banner: a failure must still reach the owner.
      if (!(options.canShowBanner?.() ?? false)) {
        toast.show({ tone: 'error', title: described.title, description: described.body });
        options.onSettled?.();
      }
    }
  }

  // Second safety net: the same post already scheduled or published in this channel. `null` = the lookup failed.
  async function hasPublication(destinationId: string): Promise<boolean | null> {
    try {
      const page = await queryClient.fetchQuery({
        ...publicationsPageQueryOptions({ postId: post.id, destinationId }),
        staleTime: 0
      });
      return page.items.some((item) => MAY_REACH_CHANNEL.has(item.status));
    } catch {
      return null;
    }
  }

  /** `target` is the post just approved by the caller: its state may not have reached this render yet. */
  async function start(formValues: PublishFormValues, skipDuplicateCheck = false, target: PostDto = post) {
    if (create.isPending) return;
    if (!skipDuplicateCheck && (await hasPublication(formValues.destinationId)) === true) {
      setDuplicate(formValues);
      return;
    }
    const intent = newIntent({
      postId: target.id,
      revision: target.revision,
      destinationId: formValues.destinationId,
      mode: formValues.mode,
      scheduledAt:
        formValues.mode === 'later' && formValues.scheduledAt
          ? formValues.scheduledAt.toDate().toISOString()
          : undefined,
      timezone: zone
    });
    // The submit press is the explicit final action: no second «are you sure» on top of it.
    await send(intent, target);
  }

  // An intent older than the server's 24 h key memory is no longer replay-protected: look before resending it.
  async function resendPending(intent: PublishIntent, target: PostDto = post) {
    if (Date.now() - intent.createdAt < INTENT_TRUSTED_MS) {
      await send(intent, target);
      return;
    }
    const found = await hasPublication(intent.destinationId);
    if (found === null) {
      setFailure({
        error: { kind: 'unavailable', tone: 'warning', ...copy.errors.staleIntentCheckFailed },
        revision: target.revision
      });
      options.onSettled?.();
      if (!(options.canShowBanner?.() ?? false)) {
        toast.show({
          tone: 'error',
          title: copy.errors.staleIntentCheckFailed.title,
          description: copy.errors.staleIntentCheckFailed.body
        });
      }
    } else if (found) {
      setStaleIntent(intent);
    } else {
      await send(intent, target);
    }
  }

  function dismissDuplicate() {
    setDuplicate(null);
    setStaleIntent(null);
  }

  function confirmDuplicate() {
    const chosen = duplicate;
    const old = staleIntent;
    dismissDuplicate();
    if (old) void send(old);
    else if (chosen) void start(chosen, true);
  }

  return {
    zone,
    isApproved,
    isPending: create.isPending,
    failure: failure && failure.revision === post.revision ? failure.error : null,
    findPending,
    start,
    resendPending,
    duplicateOpen: duplicate !== null || staleIntent !== null,
    dismissDuplicate,
    confirmDuplicate
  };
}
