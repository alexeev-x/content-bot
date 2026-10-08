import { DashboardSkeleton } from '../../features/dashboard';
import { IncidentsSkeleton } from '../../features/incidents';
import { PostsSkeleton } from '../../features/posts';
import { browserTimeZone, PublicationsSkeleton, utcOffsetLabel } from '../../features/publications';
import { ru } from '../../shared/lib/ru';
import { Panel, PageHeader, Skeleton, VisuallyHidden, useMediaQuery } from '../../shared/ui';
import styles from './RouteSkeleton.module.css';

type Props = {
  pathname: string;
  /** The page title the route will render, so the header does not change when the page arrives. */
  title: string;
};

function zoneNote(): string {
  const zone = browserTimeZone();
  return `${zone}, ${utcOffsetLabel(new Date(), zone)}`;
}

const SETTINGS_ROWS = 3;

/** /settings/*: the section nav beside a panel of rows on wide screens; on a phone the section list or the panel alone. */
function SettingsSkeleton({ title, atList }: { title: string; atList: boolean }) {
  const wide = useMediaQuery('(min-width: 860px)');
  const rows = (count: number) =>
    Array.from({ length: count }, (_, index) => (
      <div key={index} className={styles.tallRow}>
        <Skeleton width={40} height={40} radius="var(--radius-pill)" />
        <Skeleton width={index % 2 === 0 ? '45%' : '35%'} height="1em" />
        <Skeleton width={88} height={22} radius="var(--radius-pill)" />
      </div>
    ));
  const list = (
    <div className={styles.navList} aria-hidden="true">
      <Skeleton width="100%" height="var(--size-control)" radius="var(--radius-2)" />
      <Skeleton width="100%" height="var(--size-control)" radius="var(--radius-2)" />
    </div>
  );
  const detail = (
    <div className={styles.detail} aria-hidden="true">
      <Skeleton width={140} height={24} />
      <Panel reserveRows={SETTINGS_ROWS}>{rows(SETTINGS_ROWS)}</Panel>
    </div>
  );
  return (
    <div aria-busy="true">
      <VisuallyHidden>
        <output>{ru.shell.loadingPage}</output>
      </VisuallyHidden>
      <PageHeader title={title} />
      {wide ? (
        <div className={styles.settings}>
          {list}
          {detail}
        </div>
      ) : atList ? (
        list
      ) : (
        detail
      )}
    </div>
  );
}

/**
 * What a signed-in reload shows while the session is restored in the background: the route's own skeleton
 * where it exists, otherwise a generic page frame. No page renders yet, so no request leaves without a token.
 */
export function RouteSkeleton({ pathname, title }: Props) {
  if (pathname === '/') {
    return (
      <>
        <PageHeader
          title={title}
          description={ru.dashboard.description}
          actions={
            <>
              <Skeleton width={196} height="var(--size-control)" radius="var(--radius-2)" />
              <Skeleton width={128} height="var(--size-button)" radius="var(--radius-2)" />
              <Skeleton width={136} height="var(--size-button)" radius="var(--radius-2)" />
            </>
          }
        />
        <DashboardSkeleton zoneNote={zoneNote()} />
      </>
    );
  }
  const page = pathname.replace(/\/+$/, '');
  if (page === '/posts' || page === '/publications') {
    return (
      <>
        <PageHeader
          title={title}
          actions={<Skeleton width={150} height="var(--size-button)" radius="var(--radius-2)" />}
        />
        {page === '/posts' ? <PostsSkeleton /> : <PublicationsSkeleton />}
      </>
    );
  }
  if (page === '/settings' || page.startsWith('/settings/')) {
    return <SettingsSkeleton title={title} atList={page === '/settings'} />;
  }
  if (page === '/incidents') {
    return (
      <>
        <PageHeader title={title} description={`Время: ${zoneNote()}`} />
        <IncidentsSkeleton />
      </>
    );
  }
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
