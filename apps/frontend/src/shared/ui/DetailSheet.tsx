import type { ReactNode } from 'react';
import { Drawer } from './Drawer';
import styles from './DetailSheet.module.css';
import { useMediaQuery } from './use-media-query';

type Props = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: string;
  /** A StatusPill or badge next to the title. */
  status?: ReactNode;
  /** `DetailSection`s. */
  children: ReactNode;
  /** Primary and secondary buttons; pinned to the bottom, clear of the safe area. */
  footer?: ReactNode;
};

/** One details pattern for calendar, rubric and slot: bottom sheet under 860 px, 420 px right drawer above. */
export function DetailSheet({ isOpen, onOpenChange, title, subtitle, status, children, footer }: Props) {
  const phone = useMediaQuery('(max-width: 859px)');
  return (
    <Drawer
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={title}
      meta={status}
      footer={footer}
      variant={phone ? 'bottom' : 'side'}
      size="narrow"
    >
      {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
      {children}
    </Drawer>
  );
}

/** A labelled block of the sheet; fill it with `DetailRow`s. */
export function DetailSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className={styles.section}>
      <h3 className={styles.label}>{label}</h3>
      <dl className={styles.list}>{children}</dl>
    </section>
  );
}

export function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.row}>
      <dt className={styles.term}>{label}</dt>
      <dd className={styles.value}>{children}</dd>
    </div>
  );
}
