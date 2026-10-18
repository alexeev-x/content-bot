import { AiSpendSkeleton } from '../../features/ai-settings';
import { DotaSummarySkeleton } from '../../features/dota-profile';
import { AnalyticsSkeleton, LatestVideoSkeleton, TrendingSummarySkeleton } from '../../features/content-analytics';
import { DashboardSkeleton, DateChip } from '../../features/dashboard';
import { SourcesBoardSkeleton } from '../../features/dota-intelligence';
import { MediaPageSkeleton } from '../../features/media';
import { PostsSkeleton } from '../../features/posts';
import { browserTimeZone, PublicationsSkeleton, utcOffsetLabel } from '../../features/publications';
import { SettingsSkeleton } from '../../pages/settings/SettingsSkeleton';
import { ru } from '../../shared/lib/ru';
import { PageHeader, Skeleton, useMediaQuery, VisuallyHidden } from '../../shared/ui';
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

/**
 * What a signed-in reload shows while the session is restored in the background: the route's own skeleton
 * where it exists, otherwise a generic page frame. No page renders yet, so no request leaves without a token.
 */
export function RouteSkeleton({ pathname, title }: Props) {
  // Same breakpoint as the dashboard: a phone has no «Новый пост» in the header.
  const phone = useMediaQuery('(max-width: 859px)');
  if (pathname === '/') {
    return (
      <>
        <PageHeader
          title={title}
          actions={
            <>
              <DateChip placement="header" zoneNote={zoneNote()} timezone={browserTimeZone()} />
              {phone ? null : <Skeleton width={128} height="var(--size-button)" radius="var(--radius-2)" />}
            </>
          }
        />
        <DashboardSkeleton
          zoneNote={zoneNote()}
          analytics={{
            latestYoutube: <LatestVideoSkeleton />,
            latestTiktok: <LatestVideoSkeleton />,
            trending: <TrendingSummarySkeleton />
          }}
          ai={<AiSpendSkeleton />}
          dota={<DotaSummarySkeleton />}
        />
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
  if (page === '/analytics') {
    const tab = new URLSearchParams(window.location.search).get('tab');
    return (
      <AnalyticsSkeleton tab={tab === 'items' || tab === 'audience' ? tab : 'overview'} timezone={browserTimeZone()} />
    );
  }
  // The route adds the heroes tab to the library (routes/media.tsx), so the skeleton draws it too.
  if (page === '/media') return <MediaPageSkeleton extraTabLabel="Герои Dota" />;
  if (page === '/sources') {
    return (
      <>
        <PageHeader title={title} />
        <SourcesBoardSkeleton />
      </>
    );
  }
  if (page === '/settings' || page.startsWith('/settings/')) {
    return <SettingsSkeleton pathname={page} />;
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
