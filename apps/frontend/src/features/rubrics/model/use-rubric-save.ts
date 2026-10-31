import type { RubricItemDto } from '@alexeev/contracts';
import { ApiError } from '../../../shared/api/http-client';
import { useToast } from '../../../shared/ui';
import { useUpdateRubric } from '../api/rubrics-queries';
import { rubricsCopy as copy } from '../ui/copy';

/** PATCH of one rubric with the revision it showed. Nothing is assumed saved before the server answers; a 409 keeps what the owner typed. */
export function useRubricSave(item: RubricItemDto) {
  const update = useUpdateRubric();
  const toast = useToast();
  const save = (input: { enabled?: boolean; restDays?: number }) =>
    update.mutate(
      { key: item.key, input: { ...input, revision: item.revision } },
      {
        onSuccess: () => toast.show({ tone: 'success', title: copy.list.saved }),
        onError: (error) =>
          toast.show({
            tone: 'error',
            title: error instanceof ApiError && error.status === 409 ? copy.scheduler.stale : copy.scheduler.saveError
          })
      }
    );
  return { save, isPending: update.isPending };
}
