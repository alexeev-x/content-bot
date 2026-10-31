import type { RubricSchedulerStatusDto } from '@alexeev/contracts';
import { Button, Dialog } from '../../../shared/ui';
import { RubricBlockers } from './RubricBlockers';
import { rubricsCopy as copy } from './copy';

type Props = {
  status: RubricSchedulerStatusDto;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
};

/** «Что мешает запуску»: every blocker with its fix, in one place instead of a hunt across pages (owner, 31.10.2026). */
export function StartChecklistDialog({ status, isOpen, onOpenChange }: Props) {
  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={copy.scheduler.blockersDialog.title}
      description={copy.scheduler.blockersDialog.description}
      footer={
        <Button variant="secondary" onPress={() => onOpenChange(false)}>
          {copy.scheduler.blockersDialog.close}
        </Button>
      }
    >
      <RubricBlockers status={status} />
    </Dialog>
  );
}
