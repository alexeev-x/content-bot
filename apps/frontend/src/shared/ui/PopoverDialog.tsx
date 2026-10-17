import type { ReactElement, ReactNode } from 'react';
import { Dialog, DialogTrigger, Popover } from 'react-aria-components';
import styles from './PopoverDialog.module.css';

type Props = {
  /** The pressable that opens it (a React Aria Button); focus returns to it on close. */
  trigger: ReactElement;
  /** The dialog's accessible name. */
  label: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
};

/** A small non-modal panel under its trigger (desktop pickers); Esc or a press outside closes it. */
export function PopoverDialog({ trigger, label, isOpen, onOpenChange, children }: Props) {
  return (
    <DialogTrigger isOpen={isOpen} onOpenChange={onOpenChange}>
      {trigger}
      <Popover className={styles.popover} placement="bottom start" offset={6} isNonModal>
        <Dialog aria-label={label} className={styles.dialog}>
          {children}
        </Dialog>
      </Popover>
    </DialogTrigger>
  );
}
