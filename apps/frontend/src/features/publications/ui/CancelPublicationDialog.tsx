import type { PublicationDto } from '@alexeev/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Button, Dialog, useToast } from '../../../shared/ui';
import { publicationKeys, useCancelPublication } from '../api/publications-queries';
import { browserTimeZone, formatShort } from '../model/format-time';
import { publicationActions } from '../model/publication-actions';
import { describeActionError, isTerminalForAction, type ActionError } from '../model/publication-errors';
import { ActionErrorBanner } from './ActionErrorBanner';
import { copy } from './copy';

type Props = {
  publication: PublicationDto;
  postTitle: string;
  onOpenChange: (open: boolean) => void;
};

/** Destructive confirmation (alertdialog): names the post and the time, and the safe answer takes the initial focus. */
export function CancelPublicationDialog({ publication, postTitle, onOpenChange }: Props) {
  const zone = useMemo(() => browserTimeZone(), []);
  const toast = useToast();
  const queryClient = useQueryClient();
  const cancel = useCancelPublication();
  const [failure, setFailure] = useState<ActionError | null>(null);
  const canCancel = publicationActions(publication.status).canCancel;

  async function confirm() {
    if (cancel.isPending || !canCancel) return;
    setFailure(null);
    try {
      await cancel.mutateAsync({ id: publication.id, input: { revision: publication.revision } });
      toast.show({ tone: 'success', title: copy.cancelDialog.toastTitle, description: copy.cancelDialog.toastBody });
      onOpenChange(false);
    } catch (error) {
      const described = describeActionError(error, 'cancel');
      setFailure(described);
      if (described.kind === 'stale_revision' || isTerminalForAction(described.kind)) {
        void queryClient.invalidateQueries({ queryKey: publicationKeys.detail(publication.id) });
        void queryClient.invalidateQueries({ queryKey: publicationKeys.lists() });
      }
    }
  }

  const blocked: ActionError | null = canCancel
    ? null
    : { kind: 'not_cancellable', tone: 'conflict', ...copy.errors.notCancellable };
  const shownFailure = blocked ?? failure;

  return (
    <Dialog
      isOpen
      onOpenChange={onOpenChange}
      role="alertdialog"
      title={copy.cancelDialog.title(postTitle, formatShort(publication.scheduledAt, zone))}
      description={copy.cancelDialog.description}
      footer={
        <>
          {/* Intentional: the safe answer takes initial focus in a destructive confirmation (skill ui-patterns). */}
          {/* oxlint-disable-next-line jsx-a11y/no-autofocus */}
          <Button variant="secondary" autoFocus isDisabled={cancel.isPending} onPress={() => onOpenChange(false)}>
            {copy.cancelDialog.keep}
          </Button>
          <Button variant="danger" isLoading={cancel.isPending} isDisabled={!canCancel} onPress={() => void confirm()}>
            {copy.cancelDialog.confirm}
          </Button>
        </>
      }
    >
      {shownFailure ? <ActionErrorBanner error={shownFailure} /> : null}
    </Dialog>
  );
}
