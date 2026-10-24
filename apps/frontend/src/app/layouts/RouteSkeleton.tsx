import { lazy, Suspense } from 'react';
import { ru } from '../../shared/lib/ru';
import { PageHeader, Skeleton, VisuallyHidden } from '../../shared/ui';
import styles from './RouteSkeleton.module.css';

type Props = {
  pathname: string;
  /** The page title the route will render, so the header does not change when the page arrives. */
  title: string;
};

// Kept out of the entry chunk: the specific skeletons import eight feature barrels.
const FeatureSkeleton = lazy(() => import('./FeatureSkeleton').then((module) => ({ default: module.FeatureSkeleton })));

const FEATURE_PAGES = ['', '/posts', '/publications', '/analytics', '/media', '/sources'];

function hasFeatureSkeleton(page: string): boolean {
  return FEATURE_PAGES.includes(page) || page === '/settings' || page.startsWith('/settings/');
}

function GenericSkeleton({ title }: { title: string }) {
  return (
    <div aria-busy="true">
      <VisuallyHidden>
        <output>{ru.shell.loadingPage}</output>
      </VisuallyHidden>
      <PageHeader title={title} />
      <div className={styles.panel} aria-hidden="true">
        <div className={styles.head}>
          <Skeleton width="30%" height="1em" />
        </div>
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className={styles.row}>
            <Skeleton width={index % 2 === 0 ? '55%' : '40%'} height="1em" />
            <Skeleton width={88} height="var(--size-target-min)" radius="var(--radius-pill)" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * What a signed-in reload shows while the session is restored in the background: the route's own skeleton
 * where it exists (a separate chunk; the generic frame shows until it arrives), otherwise a generic page
 * frame. No page renders yet, so no request leaves without a token.
 */
export function RouteSkeleton({ pathname, title }: Props) {
  const page = pathname.replace(/\/+$/, '');
  if (!hasFeatureSkeleton(page)) return <GenericSkeleton title={title} />;
  return (
    <Suspense fallback={<GenericSkeleton title={title} />}>
      <FeatureSkeleton page={page} title={title} />
    </Suspense>
  );
}
