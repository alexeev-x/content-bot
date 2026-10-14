import { ConfirmDialog } from '../../../shared/ui';
import type { usePublish } from '../model/use-publish';
import { copy } from './copy';

type Props = {
  publish: Pick<ReturnType<typeof usePublish>, 'duplicateOpen' | 'dismissDuplicate' | 'confirmDuplicate' | 'isPending'>;
};

/** Asks before sending a post that is already scheduled or published in the same channel, or a day-old retry. */
export function PublishDuplicateDialog({ publish }: Props) {
  return (
    <ConfirmDialog
      isOpen={publish.duplicateOpen}
      onOpenChange={(open) => {
        if (!open) publish.dismissDuplicate();
      }}
      title={copy.publish.duplicateTitle}
      description={copy.publish.duplicateBody}
      confirmLabel={copy.publish.duplicateConfirm}
      cancelLabel={copy.publish.duplicateKeep}
      isPending={publish.isPending}
      onConfirm={publish.confirmDuplicate}
    />
  );
}
