import { Children, type ReactNode } from 'react';
import styles from './Carousel.module.css';

type Props = {
  /** Names the set of cards for assistive technology («Платформы»). */
  label: string;
  children: ReactNode;
  /** Narrowest card before a wide container drops a column. */
  minCard?: 'sm' | 'md';
};

/**
 * A row of cards: side by side as a grid where they fit, a swipeable strip with the next card peeking where they do
 * not (owner, 20.10.2026: on a phone the analytics blocks stacked into seven screens). The strip is a list in
 * reading order; it takes focus so a keyboard can scroll it.
 */
export function Carousel({ label, children, minCard = 'sm' }: Props) {
  const items = Children.toArray(children);
  return (
    <div className={styles.carousel} data-min={minCard}>
      {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- A scrollable region must be reachable from the keyboard (WCAG 2.1.1). */}
      <ul className={styles.track} tabIndex={0} aria-label={label}>
        {items.map((child, index) => (
          // Children have no ids of their own here; the order is the identity of a static row of cards.
          // oxlint-disable-next-line react/no-array-index-key
          <li key={index} className={styles.card}>
            {child}
          </li>
        ))}
      </ul>
    </div>
  );
}
