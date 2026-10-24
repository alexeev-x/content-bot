import { AiSpendSkeleton } from '../../features/ai-settings';
import { DotaSummarySkeleton } from '../../features/dota-profile';
import { AnalyticsSkeleton, LatestVideoSkeleton, TrendingSummarySkeleton } from '../../features/content-analytics';
import { DashboardSkeleton, DateChip } from '../../features/dashboard';
import { SourcesBoardSkeleton } from '../../features/dota-intelligence';
import { MediaPageSkeleton } from '../../features/media';
import { PostsSkeleton } from '../../features/posts';
import { browserTimeZone, PublicationsSkeleton, utcOffsetLabel } from '../../features/publications';
import { SettingsSkeleton } from '../../pages/settings/SettingsSkeleton';
import { PageHeader, Skeleton, useMediaQuery } from '../../shared/ui';

type Props = {
  /** Path without a trailing slash (the root is an empty string); the caller already checked it has a skeleton. */
  page: string;
  title: string;
};

function zoneNote(): string {
  const zone = browserTimeZone();
  return `${zone}, ${utcOffsetLabel(new Date(), zone)}`;
}

/**
 * The route-specific skeletons. Loaded lazily by RouteSkeleton so the entry chunk does not pull the feature
 * barrels in; the chunk is shared with the pages that import the same features.
 */
export function FeatureSkeleton({ page, title }: Props) {
  // Same breakpoint as the dashboard: a phone has no «Новый пост» in the header.
  const phone = useMediaQuery('(max-width: 859px)');
  if (page === '') {
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
  if (page === '/media') return <MediaPageSkeleton />;
  if (page === '/sources') {
    return (
      <>
        <PageHeader title={title} />
        <SourcesBoardSkeleton />
      </>
    );
  }
  return <SettingsSkeleton pathname={page} />;
}
