import { ru } from '../../../shared/lib/ru';
import { StaleRegion, TabPanel, Tabs, VisuallyHidden } from '../../../shared/ui';
import { AnalyticsHeader } from './AnalyticsHeader';
import type { AnalyticsTab } from './AnalyticsBoard';
import { CompareVideosPanel } from './CompareVideosPanel';
import { CrossPostedPanel } from './CrossPostedPanel';
import { FollowersGoalsPanelSkeleton } from './FollowersGoalsPanel';
import { InsightsPanel } from './InsightsPanel';
import { ItemsTable } from './ItemsTable';
import { PerformancePanel } from './PerformancePanel';
import { PostingTimesPanel } from './PostingTimesPanel';
import { RankedLists } from './RankedLists';
import styles from './Report.module.css';
import { FormatsPanel } from './FormatsPanel';
import { InviteLinksPanelSkeleton } from './InviteLinksPanel';
import { PlatformTiles } from './PlatformTiles';
import { TrendingPanel } from './TrendingPanel';

const ignore = () => {};

/**
 * «Аналитика» before the session exists: the board's own tree with no data, so the header, tabs and every
 * panel already stand where they will be, and no request leaves without a token. The panels draw their own
 * loading state; only «Цели» needs a stand-in because it reads its own query.
 */
export function AnalyticsSkeleton({ tab, timezone }: { tab: AnalyticsTab; timezone: string }) {
  return (
    <div className={styles.board} aria-busy="true">
      <VisuallyHidden>
        <output>{ru.shell.loadingPage}</output>
      </VisuallyHidden>
      <StaleRegion busy={false}>
        <Tabs selectedKey={tab} onSelectionChange={ignore}>
          <AnalyticsHeader
            description={'\u00a0'}
            days={30}
            platform={undefined}
            onDaysChange={ignore}
            onPlatformChange={ignore}
            inert
          />
          <TabPanel id="overview">
            <div className={styles.sections}>
              <PlatformTiles report={undefined} platform={undefined} days={30} />
              <InsightsPanel insights={undefined} days={30} onOpenItem={ignore} onAction={ignore} />
              <FormatsPanel series={undefined} onOpen={ignore} />
              <TrendingPanel
                items={undefined}
                baselines={[]}
                medians={{}}
                now={0}
                timezone={timezone}
                onOpen={ignore}
                limit={5}
                allLabel="Все публикации"
                onOpenAll={ignore}
              />
              <PerformancePanel
                items={undefined}
                at={0}
                platform={undefined}
                timezone={timezone}
                onOpen={ignore}
                onOpenAll={ignore}
              />
            </div>
          </TabPanel>
          <TabPanel id="items">
            <div className={styles.sections}>
              <RankedLists best={undefined} worst={undefined} onOpen={ignore} />
              <CompareVideosPanel
                items={undefined}
                tracked={[]}
                baselines={[]}
                timezone={timezone}
                picked={undefined}
                onPickedChange={ignore}
                onOpen={ignore}
              />
              <ItemsTable
                items={undefined}
                medians={{}}
                baselines={[]}
                now={0}
                timezone={timezone}
                page={1}
                onPageChange={ignore}
                sort={{ column: 'published', direction: 'descending' }}
                onSortChange={ignore}
                onOpen={ignore}
              />
            </div>
          </TabPanel>
          <TabPanel id="audience">
            <div className={styles.sections}>
              <FollowersGoalsPanelSkeleton />
              <InviteLinksPanelSkeleton />
              <CrossPostedPanel items={undefined} now={0} onOpen={ignore} />
              <PostingTimesPanel items={undefined} platform={undefined} timezone={timezone} />
            </div>
          </TabPanel>
        </Tabs>
      </StaleRegion>
    </div>
  );
}
