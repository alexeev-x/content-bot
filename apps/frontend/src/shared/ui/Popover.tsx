import type { ReactNode } from 'react';
import { Dialog, DialogTrigger, Popover as AriaPopover } from 'react-aria-components';
import styles from './Popover.module.css';

type Props = {
  /** One React Aria pressable (Button, IconButton with showTooltip={false}). */
  trigger: ReactNode;
  /** Accessible name of the popover dialog. */
  label: string;
  children: ReactNode;
  /** Controlled open state; leave both out and the trigger toggles it. */
  isOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  placement?: 'bottom start' | 'bottom end' | 'top start' | 'top end';
};

/** Anchored panel for non-modal detail: Esc and outside press close it, focus returns to the trigger. */
export function Popover({ trigger, label, children, isOpen, onOpenChange, placement = 'bottom start' }: Props) {
  return (
    <DialogTrigger {...(isOpen !== undefined ? { isOpen } : {})} {...(onOpenChange ? { onOpenChange } : {})}>
      {trigger}
      <AriaPopover placement={placement} offset={8} className={styles.popover}>
        <Dialog aria-label={label} className={styles.dialog}>
          {children}
        </Dialog>
      </AriaPopover>
    </DialogTrigger>
  );
}
