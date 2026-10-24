import type { ContentPlatform, ContentReportPeriod } from '@alexeev/contracts';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { ApiError } from '../../../shared/api/http-client';
import { useNow } from '../../../shared/lib/use-now';
import { Banner, Button, ErrorState, StaleRegion, TabPanel, Tabs, type TableSort } from '../../../shared/ui';
import { contentReportQueryOptions, contentRubricsQueryOptions } from '../api/content-analytics-queries';
import { buildActions, composeCards } from '../model/actions';
import { formatSeries } from '../model/formats';
import { rubricStats } from '../model/rubrics';
import { buildInsights } from '../model/insights';
import { mediansByPlatform, multipleOf, splitPeriods } from '../model/report';
import { useSourcesAttention } from './AnalyticsSources';
import { useLastSynced } from './last-synced';
import { copy } from './copy';
import { AnalyticsHeader } from './AnalyticsHeader';
import { CompareVideosPanel } from './CompareVideosPanel';
import { CrossPostedPanel } from './CrossPostedPanel';
import { TrendingPanel } from './TrendingPanel';
import { FollowersGoalsPanel } from './FollowersGoalsPanel';
import { InviteLinksPanel } from './InviteLinksPanel';
import { FormatsPanel } from './FormatsPanel';
import { RubricsPanel } from './RubricsPanel';
import { InsightsPanel } from './InsightsPanel';
import { ItemDrawer } from './ItemDrawer';
import { ItemsTable } from './ItemsTable';
import { PerformancePanel } from './PerformancePanel';
import { PlatformTiles } from './PlatformTiles';
import { PostingTimesPanel } from './PostingTimesPanel';
import { type RankedItem, RankedLists } from './RankedLists';
import { ReportsPanel } from './ReportsPanel';
import styles from './Report.module.css';

export type AnalyticsTab = 'overview' | 'items' | 'audience' | 'reports';

export type AnalyticsView = {
  tab: AnalyticsTab;
  days: ContentReportPeriod;
  platform: ContentPlatform | undefined;
  page: number;
  sort: TableSort;
  openId: string | undefined;
  /** «Сравнение роликов»; undefined means its default pair. */
  compare: readonly string[] | undefined;
};

type Props = {
  timezone: string;
  view: AnalyticsView;
  onViewChange: (patch: Partial<AnalyticsView>) => void;
  /** Настройки → Аналитика: sources, errors and the TikTok sign-in. */
  onOpenSettings: () => void;
};

const RANKED_LIMIT = 5;

/**
 * «Аналитика»: filters in one row on top, then the conclusions, the headline numbers against the previous
 * period, every publication against the usual, platforms side by side, followers, the best time to post,
 * leaders and laggards, and every row in a paged table. All of it is computed from one report.
 */
const COMPARE_ANCHOR = 'compare-videos';
const INVITES_ANCHOR = 'invite-links';

export function AnalyticsBoard({ timezone, view, onViewChange, onOpenSettings }: Props) {
  const { days, platform } = view;
  const reportQuery = useQuery(contentReportQueryOptions(days));
  const report = reportQuery.data;
  const now = useNow().getTime();
  const baselines = report?.baselines ?? [];
  const attention = useSourcesAttention();
  const lastSynced = useLastSynced();
  // «Сравнить по часам» in the item panel switches the tab first; the panel exists only after that render.
  const [scrollToCompare, setScrollToCompare] = useState(false);
  // «Создать ссылку» on «Ролики не приводят людей в Telegram» opens Аудитория at the invite links.
  const [scrollToInvites, setScrollToInvites] = useState(false);
  const onAudienceTab = view.tab === 'audience';
  useEffect(() => {
    if (!scrollToInvites || !onAudienceTab) return;
    const frame = requestAnimationFrame(() => {
      document.getElementById(INVITES_ANCHOR)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setScrollToInvites(false);
    });
    return () => cancelAnimationFrame(frame);
  }, [scrollToInvites, onAudienceTab]);
  const onItemsTab = view.tab === 'items';
  useEffect(() => {
    if (!scrollToCompare || !onItemsTab) return;
    const frame = requestAnimationFrame(() => {
      document.getElementById(COMPARE_ANCHOR)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setScrollToCompare(false);
    });
    return () => cancelAnimationFrame(frame);
  }, [scrollToCompare, onItemsTab]);

  const derived = useMemo(() => {
    if (!report) return undefined;
    const { current, previous } = splitPeriods(report, platform);
    const at = Date.parse(report.to);
    const medians = mediansByPlatform(current, at);
    const series = formatSeries(current, at);
    const ranked = current
      .map((item) => ({ item, multiple: multipleOf(item, medians, at) }))
      .filter((entry): entry is RankedItem => entry.multiple !== null);
    const best = [...ranked].sort((a, b) => b.multiple - a.multiple).slice(0, RANKED_LIMIT);
    // Young items have no multiple yet, so they never land among the worst.
    const worst = ranked
      .filter((entry) => !best.some((leader) => leader.item.id === entry.item.id))
      .sort((a, b) => a.multiple - b.multiple)
      .slice(0, RANKED_LIMIT);
    return {
      at,
      current,
      previous,
      medians,
      series,
      best,
      worst,
      // What to do next first, then the rule-based cards, at most four (composeCards).
      insights: composeCards(
        buildActions({ report, platform, days, series }),
        buildInsights({ report, platform, days })
      )
    };
  }, [report, platform, days]);
  // Telegram rubrics (plan B3): their own read, so a new pick or rubric shows without rebuilding the cached report.
  const showRubrics = platform === undefined || platform === 'telegram';
  const rubricsQuery = useQuery({ ...contentRubricsQueryOptions(days), enabled: showRubrics });
  const rubrics =
    derived && rubricsQuery.data ? rubricStats(derived.current, rubricsQuery.data, derived.at, timezone) : undefined;

  if (reportQuery.isError && report === undefined) {
    const requestId = reportQuery.error instanceof ApiError ? reportQuery.error.requestId : undefined;
    return (
      <ErrorState
        message={copy.loadError}
        {...(requestId ? { requestId } : {})}
        onRetry={() => void reportQuery.refetch()}
      />
    );
  }

  const open = (id: string) => onViewChange({ openId: id });
  return (
    <div className={styles.board}>
      {report?.truncated ? <p className={styles.note}>{copy.truncated}</p> : null}
      <StaleRegion busy={reportQuery.isPlaceholderData}>
        <Tabs selectedKey={view.tab} onSelectionChange={(key) => onViewChange({ tab: key as AnalyticsTab })}>
          <AnalyticsHeader
            description={lastSynced.text ?? (lastSynced.pending ? '\u00a0' : copy.subtitle)}
            days={days}
            platform={platform}
            onDaysChange={(next) => onViewChange({ days: next, page: 1 })}
            onPlatformChange={(next) => onViewChange({ platform: next, page: 1 })}
            filters={view.tab !== 'reports'}
          />
          <TabPanel id="overview">
            <div className={styles.sections}>
              <PlatformTiles report={report} platform={platform} days={days} />
              <InsightsPanel
                insights={derived?.insights}
                days={days}
                onOpenItem={open}
                onAction={() => {
                  onViewChange({ tab: 'audience', platform: undefined });
                  setScrollToInvites(true);
                }}
              />
              <FormatsPanel series={derived?.series} onOpen={open} />
              {showRubrics && !rubricsQuery.isError ? (
                <RubricsPanel summary={rubrics} onOpen={open} onOpenSettings={onOpenSettings} />
              ) : null}
              <TrendingPanel
                items={derived?.current}
                baselines={baselines}
                medians={derived?.medians ?? {}}
                now={now}
                timezone={timezone}
                onOpen={open}
                limit={5}
                allLabel="Все публикации"
                onOpenAll={() =>
                  onViewChange({ tab: 'items', sort: { column: 'published', direction: 'descending' }, page: 1 })
                }
              />
              <PerformancePanel
                items={derived?.current}
                at={derived?.at ?? 0}
                platform={platform}
                timezone={timezone}
                onOpen={open}
                onOpenAll={(each) => onViewChange({ tab: 'items', platform: each, page: 1 })}
              />
            </div>
          </TabPanel>
          <TabPanel id="items">
            <div className={styles.sections}>
              <RankedLists best={derived?.best} worst={derived?.worst} onOpen={open} />
              {/* Above the table, not under its pages: the owner looked for it and did not find it (16.10.2026). */}
              <div id={COMPARE_ANCHOR} className={styles.anchor}>
                <CompareVideosPanel
                  items={derived?.current}
                  tracked={report?.tracked ?? []}
                  baselines={baselines}
                  timezone={timezone}
                  picked={view.compare}
                  onPickedChange={(compare) => onViewChange({ compare })}
                  onOpen={open}
                />
              </div>
              <ItemsTable
                items={derived?.current}
                medians={derived?.medians ?? {}}
                baselines={baselines}
                now={now}
                timezone={timezone}
                page={view.page}
                onPageChange={(page) => onViewChange({ page })}
                sort={view.sort}
                onSortChange={(sort) => onViewChange({ sort, page: 1 })}
                activeId={view.openId}
                onOpen={open}
              />
            </div>
          </TabPanel>
          <TabPanel id="reports">
            <div className={styles.sections}>
              <ReportsPanel />
            </div>
          </TabPanel>
          <TabPanel id="audience">
            <div className={styles.sections}>
              <FollowersGoalsPanel report={report} platform={platform} />
              {platform === undefined || platform === 'telegram' ? (
                <div id={INVITES_ANCHOR} className={styles.anchor}>
                  <InviteLinksPanel days={days} onOpenSettings={onOpenSettings} />
                </div>
              ) : null}
              <CrossPostedPanel items={derived?.current} now={now} onOpen={open} />
              <PostingTimesPanel items={derived?.current} platform={platform} timezone={timezone} />
            </div>
          </TabPanel>
          {/* After the content, not above it: the notice arrives with its own query, and above the summary it shifted the whole page. */}
          {attention ? (
            <Banner
              tone={attention.tone}
              title={attention.text}
              action={
                <Button size="sm" variant="secondary" onPress={onOpenSettings}>
                  Открыть настройки
                </Button>
              }
            />
          ) : null}
        </Tabs>
      </StaleRegion>
      <ItemDrawer
        id={view.openId}
        onClose={() => onViewChange({ openId: undefined })}
        onOpen={open}
        timezone={timezone}
        now={now}
        context={derived ? { items: derived.current, medians: derived.medians, baselines, days } : undefined}
        onCompare={(ids) => {
          onViewChange({ tab: 'items', compare: ids, openId: undefined });
          setScrollToCompare(true);
        }}
      />
    </div>
  );
}
