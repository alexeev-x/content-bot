import type { ReactNode } from 'react';
import { Dialog as AriaDialog, Heading, Modal, ModalOverlay } from 'react-aria-components';
import { ru } from '../lib/ru';
import styles from './Drawer.module.css';
import { IconButton } from './IconButton';

type Props = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Header content next to the title, e.g. a StatusBadge. */
  meta?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /**
   * `side`: a right panel on desktop and a full-screen sheet below 860 px (publication detail).
   * `bottom`: a bottom sheet at every width (the «Ещё» menu).
   */
  variant?: 'side' | 'bottom';
};

/** Inspector panel that keeps the page behind it visible; focus is trapped, Esc and the scrim close it. */
export function Drawer({ isOpen, onOpenChange, title, meta, children, footer, variant = 'side' }: Props) {
  return (
    <ModalOverlay
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isDismissable
      data-variant={variant}
      data-drawer={variant}
      className={styles.overlay}
    >
      <Modal className={styles.modal}>
        <AriaDialog className={styles.dialog}>
          {({ close }) => (
            <>
              <header className={styles.header}>
                <div className={styles.heading}>
                  <Heading slot="title" className={styles.title}>
                    {title}
                  </Heading>
                  {meta ? <div className={styles.meta}>{meta}</div> : null}
                </div>
                <IconButton label={ru.ui.close} icon="x" size="sm" showTooltip={false} onPress={close} />
              </header>
              <div className={styles.body}>{children}</div>
              {footer ? <footer className={styles.footer}>{footer}</footer> : null}
            </>
          )}
        </AriaDialog>
      </Modal>
    </ModalOverlay>
  );
}
