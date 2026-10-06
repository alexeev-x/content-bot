import type { CSSProperties } from 'react';
import styles from './Skeleton.module.css';

type Props = { width?: number | string; height?: number | string; radius?: string; lines?: number };

/**
 * Decorative placeholder shaped like the final content. The region that owns it sets `aria-busy` and the
 * status text; the skeleton itself is hidden from assistive technology.
 */
export function Skeleton({ width = '100%', height = 16, radius = 'var(--radius-1)', lines = 1 }: Props) {
  const style = { width, height, borderRadius: radius } satisfies CSSProperties;
  if (lines <= 1) return <span className={styles.skeleton} style={style} aria-hidden="true" />;
  return (
    <span className={styles.lines} aria-hidden="true">
      {Array.from({ length: lines }, (_, index) => (
        <span
          key={index}
          className={styles.skeleton}
          style={{ ...style, width: index === lines - 1 ? '60%' : width }}
        />
      ))}
    </span>
  );
}
