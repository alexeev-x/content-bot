import type { RubricSchedulerStatusDto } from '@alexeev/contracts';
import { useQuery } from '@tanstack/react-query';
import { ApiError } from '../../../shared/api/http-client';
import { useToast } from '../../../shared/ui';
import { rubricChannelsQueryOptions, useUpdateRubricScheduler } from '../api/rubrics-queries';
import { rubricsCopy as copy } from '../ui/copy';

type Lock = RubricSchedulerStatusDto['locks'][number];

/** «Рубрики выключены» is what «Старт» itself lifts, so it never counts as a blocker. */
export const startBlockers = (status: RubricSchedulerStatusDto): Lock[] =>
  status.locks.filter((lock) => lock.code !== 'SWITCHED_OFF');

/** Live and the DEV rehearsal both post where the owner picks (owner, 31.10.2026). */
export const picksChannel = (status: RubricSchedulerStatusDto) => status.mode === 'live' || status.mode === 'rehearsal';

export const isDevFix = (lock: Lock) => lock.fix === 'ENABLE_LAB_JOB' || lock.fix === 'ENABLE_LAB_MASTER';

/** The channel in use stays listed while the list loads, fails, or no longer offers it (switched off). */
export function useChannelOptions(status: RubricSchedulerStatusDto) {
  const channels = useQuery({ ...rubricChannelsQueryOptions(), enabled: picksChannel(status) });
  const listed = (channels.data?.items ?? [])
    .filter((item) => item.kind === 'channel')
    .map((item) => ({ id: item.id, label: item.title }));
  const current = status.destination;
  const options =
    current === null || listed.some((item) => item.id === current.id)
      ? listed
      : [{ id: current.id, label: current.title }, ...listed];
  return { options, isError: channels.isError };
}

/**
 * Saves the switch and the channel on the revision the screen showed. Never optimistic: `onSuccess` runs only after the
 * server's answer; a 409 means the screen was stale and says so.
 */
export function useSchedulerSave(status: RubricSchedulerStatusDto) {
  const update = useUpdateRubricScheduler();
  const toast = useToast();
  const save = (
    input: { enabled: boolean; destinationId: string | null },
    handlers: { onSuccess?: () => void; onError?: () => void } = {}
  ) =>
    update.mutate(
      { ...input, revision: status.revision },
      {
        onSuccess: () => handlers.onSuccess?.(),
        onError: (error) => {
          handlers.onError?.();
          toast.show({
            tone: 'error',
            title: error instanceof ApiError && error.status === 409 ? copy.scheduler.stale : copy.scheduler.saveError
          });
        }
      }
    );
  return { save, isPending: update.isPending };
}
