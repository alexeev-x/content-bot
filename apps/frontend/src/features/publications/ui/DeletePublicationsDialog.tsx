import type { PublicationDeleteRefusal, PublicationDto } from '@alexeev/contracts';
import { useState } from 'react';
import { ApiError } from '../../../shared/api/http-client';
import { Banner, Button, Dialog, useToast } from '../../../shared/ui';
import { useBulkDeletePublications, useDeletePublication } from '../api/publications-queries';
import { copy } from './copy';

export type DeletePublicationTarget = { id: string; title: string; revision: number };
export type DeletePublicationsOutcome = {
  deleted: string[];
  refused: ReadonlyMap<string, PublicationDeleteRefusal>;
};

type Props = {
  targets: readonly DeletePublicationTarget[];
  onOpenChange: (open: boolean) => void;
  onDone: (outcome: DeletePublicationsOutcome) => void;
};

export function deleteTargetOf(publication: PublicationDto, title: string): DeletePublicationTarget {
  return { id: publication.id, title, revision: publication.revision };
}

export function DeletePublicationsDialog({ targets, onOpenChange, onDone }: Props) {
  const toast = useToast();
  const single = useDeletePublication();
  const bulk = useBulkDeletePublications();
  const [failure, setFailure] = useState<{ requestId?: string } | null>(null);
  const isPending = single.isPending || bulk.isPending;

  async function confirm() {
    if (isPending) return;
    setFailure(null);
    try {
      if (targets.length === 1) {
        const target = targets[0]!;
        await single.mutateAsync({ id: target.id, input: { revision: target.revision } });
        toast.show({ tone: 'success', title: copy.deletion.deletedOne });
        onDone({ deleted: [target.id], refused: new Map() });
      } else {
        const result = await bulk.mutateAsync({ items: targets.map(({ id, revision }) => ({ id, revision })) });
        const deleted = result.items.filter((item) => item.outcome === 'deleted').map((item) => item.id);
        const refused = new Map(
          result.items.flatMap((item) => (item.outcome === 'refused' ? [[item.id, item.reason] as const] : []))
        );
        toast.show({
          tone: refused.size > 0 ? 'error' : 'success',
          title:
            refused.size === targets.length
              ? copy.deletion.failedAll
              : refused.size > 0
                ? copy.deletion.deletedSome(deleted.length, targets.length)
                : copy.deletion.deletedMany(deleted.length)
        });
        onDone({ deleted, refused });
      }
      onOpenChange(false);
    } catch (error) {
      setFailure(error instanceof ApiError && error.requestId ? { requestId: error.requestId } : {});
    }
  }

  const title =
    targets.length === 1 ? copy.deletion.titleOne(targets[0]!.title) : copy.deletion.titleMany(targets.length);
  return (
    <Dialog
      isOpen
      onOpenChange={(open) => {
        if (!isPending) onOpenChange(open);
      }}
      role="alertdialog"
      title={title}
      description={`${copy.deletion.body} ${copy.deletion.history} ${copy.deletion.irreversible}`}
      footer={
        <>
          {/* A destructive confirmation starts on the safe action, per ui-patterns. */}
          {/* oxlint-disable-next-line jsx-a11y/no-autofocus */}
          <Button variant="secondary" autoFocus isDisabled={isPending} onPress={() => onOpenChange(false)}>
            {copy.deletion.keep}
          </Button>
          <Button variant="danger" isLoading={isPending} onPress={() => void confirm()}>
            {isPending
              ? copy.deletion.pending
              : targets.length === 1
                ? copy.deletion.confirm
                : copy.deletion.confirmMany}
          </Button>
        </>
      }
    >
      {failure ? (
        <Banner
          tone="error"
          title={copy.deletion.failed}
          action={
            <Button size="sm" variant="secondary" icon="retry" isDisabled={isPending} onPress={() => void confirm()}>
              Повторить
            </Button>
          }
        >
          {failure.requestId ? `ID запроса: ${failure.requestId}` : null}
        </Banner>
      ) : null}
    </Dialog>
  );
}
