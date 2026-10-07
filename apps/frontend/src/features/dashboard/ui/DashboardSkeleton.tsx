import { Skeleton, VisuallyHidden } from '../../../shared/ui';
import { Block } from './Block';
import { copy } from './copy';
import styles from './Dashboard.module.css';

function SkeletonRows({ count }: { count: number }) {
  return (
    <ul className={styles.list} aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <li key={index} className={styles.skeletonRow}>
          <Skeleton height="var(--size-button)" />
        </li>
      ))}
    </ul>
  );
}

/** One placeholder per block at the height of the real rows, so nothing jumps when the data arrives. */
export function DashboardSkeleton() {
  return (
    <div className={styles.root} aria-busy="true">
      <VisuallyHidden>
        <output>{copy.loading}</output>
      </VisuallyHidden>
      <div className={styles.columns}>
        <div className={styles.column}>
          <Block title={copy.attention.title}>
            <SkeletonRows count={2} />
          </Block>
          <Block title={copy.today.title}>
            <SkeletonRows count={4} />
          </Block>
        </div>
        <div className={styles.column}>
          <Block title={copy.upcoming.title}>
            <SkeletonRows count={3} />
          </Block>
          <Block title={copy.recent.title}>
            <SkeletonRows count={3} />
          </Block>
        </div>
      </div>
    </div>
  );
}
