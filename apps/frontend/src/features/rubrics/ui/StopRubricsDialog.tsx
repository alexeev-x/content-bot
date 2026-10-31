import type { RubricSchedulerStatusDto } from '@alexeev/contracts';
import { ConfirmDialog, useToast } from '../../../shared/ui';
import { useSchedulerSave } from '../model/scheduler-model';
import { rubricsCopy as copy } from './copy';

type Props = {
  status: RubricSchedulerStatusDto;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
};

/** «Остановить рубрики?» (DECISIONS 13.10.2026): closes only after the server confirmed the switch-off. */
export function StopRubricsDialog({ status, isOpen, onOpenChange }: Props) {
  const { save, isPending } = useSchedulerSave(status);
  const toast = useToast();
  return (
    <ConfirmDialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={copy.scheduler.stop.title}
      description={copy.scheduler.stop.description}
      confirmLabel={copy.scheduler.stop.confirm}
      cancelLabel={copy.scheduler.stop.keep}
      isPending={isPending}
      onConfirm={() =>
        save(
          { enabled: false, destinationId: status.destination?.id ?? null },
          {
            onSuccess: () => {
              onOpenChange(false);
              toast.show({ tone: 'success', title: copy.scheduler.stop.stopped });
            }
          }
        )
      }
    />
  );
}
