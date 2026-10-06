import type { ReactNode } from 'react';
import { Dialog as AriaDialog, Heading, Modal, ModalOverlay, Text } from 'react-aria-components';
import { ru } from '../lib/ru';
import { IconButton } from './IconButton';
import styles from './Dialog.module.css';

type Props = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children?: ReactNode;
  /** Buttons row. Put the safest action first in DOM order only if it should take initial focus. */
  footer?: ReactNode;
  /** `alertdialog` for confirmations that need an explicit answer (no backdrop dismiss). */
  role?: 'dialog' | 'alertdialog';
  /** `wide` for dialogs that lay out content side by side on desktop; phones get the full width either way. */
  size?: 'default' | 'wide';
};

/** Modal dialog: inert background, focus trap, Esc, focus back to the trigger (React Aria Modal). Never nest dialogs. */
export function Dialog({
  isOpen,
  onOpenChange,
  title,
  description,
  children,
  footer,
  role = 'dialog',
  size = 'default'
}: Props) {
  return (
    <ModalOverlay
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isDismissable={role === 'dialog'}
      className={styles.overlay}
    >
      <Modal className={size === 'wide' ? `${styles.modal} ${styles.wide}` : styles.modal}>
        <AriaDialog role={role} className={styles.dialog}>
          {({ close }) => (
            <>
              <header className={styles.header}>
                <Heading slot="title" className={styles.title}>
                  {title}
                </Heading>
                {role === 'dialog' ? (
                  <IconButton label={ru.ui.close} icon="x" size="sm" showTooltip={false} onPress={close} />
                ) : null}
              </header>
              {description ? (
                <Text slot="description" className={styles.description}>
                  {description}
                </Text>
              ) : null}
              {children ? <div className={styles.body}>{children}</div> : null}
              {footer ? <footer className={styles.footer}>{footer}</footer> : null}
            </>
          )}
        </AriaDialog>
      </Modal>
    </ModalOverlay>
  );
}
