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

export function DashboardSkeleton() {
  return (
    <div className={styles.root} aria-busy="true">
      <VisuallyHidden>
        <output>{copy.loading}</output>
      </VisuallyHidden>

      <div className={styles.summaryGrid} aria-hidden="true">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className={styles.summaryCard}>
            <Skeleton height="var(--size-control)" />
          </div>
        ))}
      </div>

      <div className={styles.dashboardGrid}>
        <div className={styles.attentionCell}>
          <Block title={copy.attention.title}>
            <SkeletonRows count={1} />
          </Block>
        </div>
        <div className={styles.dotaCell}>
          <Block title="Dota Pulse">
            <SkeletonRows count={3} />
          </Block>
        </div>
        <div className={styles.todayCell}>
          <Block title={copy.today.title}>
            <SkeletonRows count={2} />
          </Block>
        </div>
        <div className={styles.analyticsCell}>
          <Block title="Аналитика канала">
            <SkeletonRows count={1} />
          </Block>
        </div>
        <div className={styles.upcomingCell}>
          <Block title={copy.upcoming.title}>
            <SkeletonRows count={2} />
          </Block>
        </div>
        <div className={styles.watchlistCell}>
          <Block title="Отслеживание">
            <SkeletonRows count={1} />
          </Block>
        </div>
        <div className={styles.recentCell}>
          <Block title={copy.recent.title}>
            <SkeletonRows count={2} />
          </Block>
        </div>
      </div>
    </div>
  );
}
