import { Children, useRef, useState, type ReactNode } from 'react';
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
 * reading order; it takes focus so a keyboard can scroll it. On the strip, dots under it say which card is shown and
 * that there are more (a cut-off card alone read as a bug in the 31.10.2026 review).
 */
export function Carousel({ label, children, minCard = 'sm' }: Props) {
  const items = Children.toArray(children);
  const track = useRef<HTMLUListElement>(null);
  const [active, setActive] = useState(0);
  const onScroll = () => {
    const element = track.current;
    const first = element?.firstElementChild;
    if (element === null || !(first instanceof HTMLElement) || first.offsetWidth === 0) return;
    const index = Math.round(element.scrollLeft / first.offsetWidth);
    setActive(Math.min(Math.max(index, 0), items.length - 1));
  };
  return (
    <div className={styles.carousel} data-min={minCard}>
      {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- A scrollable region must be reachable from the keyboard (WCAG 2.1.1). */}
      <ul ref={track} className={styles.track} tabIndex={0} aria-label={label} onScroll={onScroll}>
        {items.map((child, index) => (
          // Children have no ids of their own here; the order is the identity of a static row of cards.
          // oxlint-disable-next-line react/no-array-index-key
          <li key={index} className={styles.card}>
            {child}
          </li>
        ))}
      </ul>
      {items.length > 1 ? (
        <div className={styles.dots} aria-hidden="true">
          {items.map((_, index) => (
            // oxlint-disable-next-line react/no-array-index-key
            <span key={index} className={styles.dot} data-active={index === active || undefined} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
