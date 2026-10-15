import type { ContentPlatform, ContentReportPeriod } from '@alexeev/contracts';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { ApiError } from '../../../shared/api/http-client';
import { useNow } from '../../../shared/lib/use-now';
import {
  Banner,
  Button,
  ErrorState,
  PageHeader,
  Select,
  StaleRegion,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  type TableSort,
  useToast
} from '../../../shared/ui';
import { contentReportQueryOptions, useSyncContent } from '../api/content-analytics-queries';
import { formatCount, formatDay, formatPublished, PLATFORM_LABEL } from '../model/format';
import { buildInsights } from '../model/insights';
import {
  followersStats,
  mediansByPlatform,
  multipleOf,
  percentChange,
  periodStats,
  PLATFORMS,
  cumulative,
  splitPeriods,
  viewsByDay,
  zonedParts
} from '../model/report';
import { useSourcesAttention } from './AnalyticsSources';
import { useLastSyncedText } from './last-synced';
import { copy } from './copy';
import { CompareVideosPanel } from './CompareVideosPanel';
import { DynamicsPanel } from './DynamicsPanel';
import { TrendingPanel } from './TrendingPanel';
import { FollowersPanel } from './FollowersPanel';
import { InsightsPanel, type InsightsSummary } from './InsightsPanel';
import { ItemDrawer } from './ItemDrawer';
import { ItemsTable } from './ItemsTable';
import { type Kpi, KpiStrip } from './KpiStrip';
import { PerformancePanel } from './PerformancePanel';
import { PlatformComparison } from './PlatformComparison';
import { PostingHeatmap } from './PostingHeatmap';
import { type RankedItem, RankedLists } from './RankedLists';
import styles from './Report.module.css';

export type AnalyticsTab = 'overview' | 'items' | 'audience';

export type AnalyticsView = {
  tab: AnalyticsTab;
  days: ContentReportPeriod;
  platform: ContentPlatform | undefined;
  page: number;
  sort: TableSort;
  openId: string | undefined;
};

type Props = {
  timezone: string;
  view: AnalyticsView;
  onViewChange: (patch: Partial<AnalyticsView>) => void;
  /** Настройки → Аналитика: sources, errors and the TikTok sign-in. */
  onOpenSettings: () => void;
};

const PERIODS = [
  { id: '7', label: '7 дней' },
  { id: '30', label: '30 дней' },
  { id: '90', label: '90 дней' }
] as const;
const PLATFORM_FILTERS = [
  { id: 'all', label: copy.table.all },
  ...PLATFORMS.map((platform) => ({ id: platform, label: PLATFORM_LABEL[platform] }))
];
const SETTLED_MS = 48 * 3_600_000;
const RANKED_LIMIT = 5;

/**
 * «Аналитика»: filters in one row on top, then the conclusions, the headline numbers against the previous
 * period, every publication against the usual, platforms side by side, followers, the best time to post,
 * leaders and laggards, and every row in a paged table. All of it is computed from one report.
 */
export function AnalyticsBoard({ timezone, view, onViewChange, onOpenSettings }: Props) {
  const { days, platform } = view;
  const reportQuery = useQuery(contentReportQueryOptions(days));
  const report = reportQuery.data;
  const now = useNow().getTime();
  const baselines = report?.baselines ?? [];
  const attention = useSourcesAttention();
  const lastSynced = useLastSyncedText();

  const derived = useMemo(() => {
    if (!report) return undefined;
    const { current, previous } = splitPeriods(report, platform);
    const stats = periodStats(current);
    const before = periodStats(previous);
    const medians = mediansByPlatform(current);
    const daily = viewsByDay(current, report.from, report.to, timezone);
    const followers = (platform === undefined ? PLATFORMS : [platform]).map((each) => followersStats(report, each));
    const followersNow = followers.reduce<number | null>(
      (sum, entry) => (entry.now === null ? sum : (sum ?? 0) + entry.now),
      null
    );
    const followersByDay = new Map<string, number>();
    for (const entry of followers) {
      for (const point of entry.points)
        followersByDay.set(point.day, (followersByDay.get(point.day) ?? 0) + point.followers);
    }
    const followersSeries = [...followersByDay]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, value]) => ({ day, followers: value }));
    const followersChange = followers.reduce<number | null>(
      (sum, entry) => (entry.change === null ? sum : (sum ?? 0) + entry.change),
      null
    );
    const viewsTotal = cumulative(daily.map((entry) => entry.views));
    // Engagement per day of publishing: reactions, comments and shares per 100 views of that day's items.
    const engagementByDay = daily.map((entry) => {
      const ofDay = current.filter((item) => zonedParts(item.publishedAt, timezone).day === entry.day);
      return periodStats(ofDay).engagement ?? 0;
    });
    const kpis: Kpi[] = [
      {
        id: 'views',
        label: copy.kpi.views,
        icon: 'eye',
        value: formatCount(stats.views),
        change: before.items > 0 ? percentChange(stats.views, before.views) : null,
        hint: copy.kpi.noBase,
        series: viewsTotal,
        tips: daily.map(
          (entry, index) =>
            `${formatDay(entry.day)}: ${formatCount(viewsTotal[index] ?? 0)} всего, +${formatCount(entry.views)} за день`
        )
      },
      {
        id: 'items',
        label: copy.kpi.items,
        icon: 'file',
        value: String(stats.items),
        change: before.items > 0 ? percentChange(stats.items, before.items) : null,
        hint: copy.kpi.noBase,
        chart: 'bars',
        series: daily.map((entry) => entry.items),
        tips: daily.map((entry) => `${formatDay(entry.day)}: ${entry.items} публ.`)
      },
      // One median across Telegram and YouTube means nothing (300 against 100 000): with every platform
      // shown, the tile gives the Telegram reach instead, the measure the channel's ads are sold on.
      platform === undefined
        ? telegramReachKpi(report, timezone)
        : {
            id: 'median',
            label: copy.kpi.median,
            icon: 'chart',
            value: formatCount(stats.medianViews),
            change: percentChange(stats.medianViews, before.medianViews),
            hint: copy.kpi.noBase
          },
      {
        id: 'engagement',
        label: copy.kpi.engagement,
        icon: 'heart',
        value: stats.engagement === null ? '—' : `${stats.engagement.toLocaleString('ru-RU')}%`,
        change: percentChange(stats.engagement, before.engagement),
        hint: copy.kpi.noBase,
        color: 'var(--color-series-2)',
        series: engagementByDay,
        tips: daily.map(
          (entry, index) => `${formatDay(entry.day)}: ${(engagementByDay[index] ?? 0).toLocaleString('ru-RU')}%`
        )
      },
      {
        id: 'followers',
        label: copy.kpi.followers,
        icon: 'users',
        value: formatCount(followersNow),
        change: null,
        absolute: followersChange,
        hint: copy.kpi.followersCollecting,
        color: 'var(--color-series-3)',
        series: followersSeries.map((point) => point.followers),
        tips: followersSeries.map((point) => `${formatDay(point.day)}: ${formatCount(point.followers)}`)
      }
    ];
    const hitsOf = (items: typeof current) => {
      const ownMedians = mediansByPlatform(items);
      return items.filter((item) => (multipleOf(item, ownMedians) ?? 0) >= 1.5).length;
    };
    const hits = hitsOf(current);
    const summary: InsightsSummary = {
      views: {
        value: formatCount(stats.views),
        change: before.items > 0 ? percentChange(stats.views, before.views) : null,
        series: daily.map((entry) => entry.views),
        tips: daily.map((entry) => `${formatDay(entry.day)}: ${formatCount(entry.views)}`)
      },
      hits: { hits, total: stats.items, diff: before.items > 0 ? hits - hitsOf(previous) : null },
      cadence: {
        perWeek: (Math.round((stats.items / days) * 7 * 10) / 10).toLocaleString('ru-RU'),
        change: before.items > 0 ? percentChange(stats.items, before.items) : null
      }
    };
    const ranked = current
      .map((item) => ({ item, multiple: multipleOf(item, medians) }))
      .filter((entry): entry is RankedItem => entry.multiple !== null);
    const best = [...ranked].sort((a, b) => b.multiple - a.multiple).slice(0, RANKED_LIMIT);
    // The last two days are still collecting views: they would always look weak.
    const worst = ranked
      .filter((entry) => Date.parse(report.to) - Date.parse(entry.item.publishedAt) > SETTLED_MS)
      .filter((entry) => !best.some((leader) => leader.item.id === entry.item.id))
      .sort((a, b) => a.multiple - b.multiple)
      .slice(0, RANKED_LIMIT);
    return {
      current,
      previous,
      medians,
      kpis,
      summary,
      best,
      worst,
      insights: buildInsights({ report, platform, days, timezone })
    };
  }, [report, platform, days, timezone]);

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
          <PageHeader
            title={copy.title}
            description={lastSynced ?? 'Telegram, YouTube и TikTok в одном месте'}
            focusHeadingOnMount
            actions={
              <div className={styles.toolbar}>
                <TabList aria-label="Разделы аналитики">
                  <Tab id="overview">Обзор</Tab>
                  <Tab id="items">Публикации</Tab>
                  <Tab id="audience">Аудитория</Tab>
                </TabList>
                <div className={styles.toolbarFilters}>
                  <Select
                    label={copy.filters.period}
                    inlineLabel
                    options={PERIODS}
                    value={String(days)}
                    onChange={(id) => onViewChange({ days: Number(id) as ContentReportPeriod, page: 1 })}
                  />
                  <Select
                    label={copy.filters.platform}
                    inlineLabel
                    options={PLATFORM_FILTERS}
                    value={platform ?? 'all'}
                    onChange={(id) =>
                      onViewChange({ platform: id === 'all' ? undefined : (id as ContentPlatform), page: 1 })
                    }
                  />
                  <RefreshAnalyticsButton />
                </div>
              </div>
            }
          />
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
          <TabPanel id="overview">
            <div className={styles.sections}>
              <section className={styles.summary} aria-labelledby="summary-title">
                <h2 id="summary-title" className={styles.summaryTitle}>
                  Сводка за {days} дней
                  {report ? (
                    <span>
                      {formatDay(report.from.slice(0, 10))} — {formatDay(report.to.slice(0, 10))}
                    </span>
                  ) : null}
                </h2>
                <KpiStrip kpis={derived?.kpis} days={days} />
              </section>
              <InsightsPanel insights={derived?.insights} summary={derived?.summary} days={days} onOpenItem={open} />
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
                platform={platform}
                timezone={timezone}
                onOpen={open}
                onOpenAll={(each) => onViewChange({ tab: 'items', platform: each, page: 1 })}
              />
              <DynamicsPanel report={report} platform={platform} days={days} />
            </div>
          </TabPanel>
          <TabPanel id="items">
            <div className={styles.sections}>
              <RankedLists best={derived?.best} worst={derived?.worst} onOpen={open} />
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
              <CompareVideosPanel
                items={derived?.current}
                tracked={report?.tracked ?? []}
                baselines={baselines}
                timezone={timezone}
                onOpen={open}
              />
            </div>
          </TabPanel>
          <TabPanel id="audience">
            <div className={styles.sections}>
              <FollowersPanel report={report} platform={platform} />
              {platform === undefined ? <PlatformComparison report={report} /> : null}
              <PostingHeatmap items={derived?.current} platform={platform} timezone={timezone} />
            </div>
          </TabPanel>
        </Tabs>
      </StaleRegion>
      <ItemDrawer
        id={view.openId}
        onClose={() => onViewChange({ openId: undefined })}
        onOpen={open}
        timezone={timezone}
        now={now}
        context={derived ? { items: derived.current, medians: derived.medians, baselines, days } : undefined}
      />
    </div>
  );
}

function telegramReachKpi(report: NonNullable<Parameters<typeof splitPeriods>[0]>, timezone: string): Kpi {
  const { current, previous } = splitPeriods(report, 'telegram');
  const followers = followersStats(report, 'telegram').now;
  const reach = (items: typeof current) => {
    const value = periodStats(items).medianViews;
    return followers === null || followers === 0 || value === null ? null : Math.round((value / followers) * 100);
  };
  const now = reach(current);
  // Each post's reach in publishing order: what a reader of the channel actually saw.
  const posts = [...current]
    .filter((item) => item.views !== null)
    .sort((a, b) => Date.parse(a.publishedAt) - Date.parse(b.publishedAt))
    .slice(-30);
  const perPost = posts.map((item) => (followers ? Math.round(((item.views ?? 0) / followers) * 100) : 0));
  return {
    id: 'reach',
    label: copy.kpi.reach,
    icon: 'send',
    value: now === null ? '—' : `${now}%`,
    change: percentChange(now, reach(previous)),
    hint: copy.kpi.noBase,
    chart: 'bars',
    color: 'var(--color-platform-telegram)',
    series: perPost,
    tips: posts.map((item, index) => `${formatPublished(item.publishedAt, timezone)}: ${perPost[index]}%`)
  };
}

/** Page header action: collects now (the server skips a source collected in the last 5 minutes). */
export function RefreshAnalyticsButton() {
  const sync = useSyncContent();
  const toast = useToast();
  return (
    <Button
      variant="secondary"
      icon="retry"
      isLoading={sync.isPending}
      onPress={() =>
        sync.mutate(undefined, {
          onSuccess: () => toast.show({ tone: 'success', title: copy.refreshed }),
          onError: () => toast.show({ tone: 'error', title: copy.refreshFailed })
        })
      }
    >
      {copy.refresh}
    </Button>
  );
}
