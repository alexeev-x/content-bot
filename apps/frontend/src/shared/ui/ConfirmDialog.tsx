import { Button } from './Button';
import { Dialog } from './Dialog';
import { ru } from '../lib/ru';

type Props = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  /** Names the object: «Отменить публикацию "Герой дня" на 14:30?» */
  title: string;
  /** States the consequence, and for `unknown` the duplicate-post warning. */
  description: string;
  /** A verb phrase, never «OK» or «Да». */
  confirmLabel: string;
  /** Verb phrase for the safe answer, e.g. «Не отменять». */
  cancelLabel?: string;
  onConfirm: () => void;
  tone?: 'danger' | 'default';
  /** The server call is in flight: no optimistic success, the dialog stays until the caller closes it. */
  isPending?: boolean;
};

/** Destructive confirmation (alertdialog). The safe button comes first and takes the initial focus. */
export function ConfirmDialog({
  isOpen,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = ru.ui.cancel,
  onConfirm,
  tone = 'danger',
  isPending = false
}: Props) {
  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      role="alertdialog"
      title={title}
      description={description}
      footer={
        <>
          {/* Intentional: the safe answer takes initial focus in a destructive confirmation (skill ui-patterns). */}
          {/* oxlint-disable-next-line jsx-a11y/no-autofocus */}
          <Button variant="secondary" autoFocus isDisabled={isPending} onPress={() => onOpenChange(false)}>
            {cancelLabel}
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} isLoading={isPending} onPress={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    />
  );
}
