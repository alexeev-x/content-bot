import type { ReactNode } from 'react';
import { Button as AriaButton, Dialog as AriaDialog, Heading, Modal, ModalOverlay } from 'react-aria-components';
import { Icon, type IconName } from './Icon';
import styles from './BottomSheet.module.css';

type SheetProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** ActionRow list or other content. */
  children: ReactNode;
  /** Bottom area, normally one full-width «Отмена» button. */
  footer?: ReactNode;
};

/**
 * Phone action sheet: grabber, title, rows, cancel. Focus is trapped, Esc and the scrim close it and return focus to the
 * trigger. The grabber is a visual cue; «Отмена» in the footer is the explicit way out, so no «×» is drawn.
 */
export function BottomSheet({ isOpen, onOpenChange, title, children, footer }: SheetProps) {
  return (
    <ModalOverlay isOpen={isOpen} onOpenChange={onOpenChange} isDismissable className={styles.overlay}>
      <Modal className={styles.modal}>
        <AriaDialog className={styles.dialog}>
          <span className={styles.grabber} aria-hidden="true" />
          <Heading slot="title" className={styles.title}>
            {title}
          </Heading>
          <div className={styles.rows}>{children}</div>
          {footer ? <div className={styles.footer}>{footer}</div> : null}
        </AriaDialog>
      </Modal>
    </ModalOverlay>
  );
}

type RowProps = {
  icon: IconName;
  title: string;
  /** Muted line under the title. */
  hint?: string;
  onPress: () => void;
  isDisabled?: boolean;
  /** Replaces the chevron (for a choice that does not open another level). */
  trailing?: ReactNode;
};

/** Sheet row: 40 px accent icon circle, bold title, muted hint, chevron; 64 px tall, the whole row is the target. */
export function ActionRow({ icon, title, hint, onPress, isDisabled, trailing }: RowProps) {
  return (
    <AriaButton onPress={onPress} isDisabled={isDisabled} className={styles.action}>
      <span className={styles.actionIcon} aria-hidden="true">
        <Icon name={icon} size={22} />
      </span>
      <span className={styles.actionText}>
        <span className={styles.actionTitle}>{title}</span>
        {hint ? <span className={styles.actionHint}>{hint}</span> : null}
      </span>
      {trailing ?? <Icon name="chevron-right" size={20} className={styles.chevron} />}
    </AriaButton>
  );
}
