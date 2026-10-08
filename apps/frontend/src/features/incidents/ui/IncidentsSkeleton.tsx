import { Panel, Skeleton, VisuallyHidden } from '../../../shared/ui';
import { copy } from './copy';
import styles from './Incidents.module.css';

const ROWS = 5;

/** The list panel while incidents load: rows of the real height. The busy region holds exactly the rows. */
export function IncidentsListSkeleton() {
  return (
    <Panel>
      <div className={styles.skeleton} aria-busy="true">
        <VisuallyHidden>
          <output>{copy.loading}</output>
        </VisuallyHidden>
        {Array.from({ length: ROWS }, (_, index) => (
          <div key={index} className={styles.skeletonRow}>
            <Skeleton width={96} height="var(--size-target-min)" radius="var(--radius-pill)" />
            <span className={styles.skeletonText}>
              <Skeleton width={index % 2 === 0 ? '55%' : '40%'} height={14} />
            </span>
            <Skeleton width={72} height={14} />
          </div>
        ))}
      </div>
    </Panel>
  );
}

/** The incidents page while the session is restored: filter placeholders above the same list skeleton; no request runs. */
export function IncidentsSkeleton() {
  return (
    <>
      <div className={styles.skeletonFilters} aria-hidden="true">
        <Skeleton width={168} height="var(--size-control)" radius="var(--radius-2)" />
        <Skeleton width={280} height="var(--size-control)" radius="var(--radius-2)" />
      </div>
      <IncidentsListSkeleton />
    </>
  );
}
