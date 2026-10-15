import type { ContentPlatform, ContentReportPeriod } from '@alexeev/contracts';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { ApiError } from '../../../shared/api/http-client';
import { useNow } from '../../../shared/lib/use-now';
import {
  Banner,
  Button,
  ErrorState,
  Panel,
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
import { formatCount, formatDay, PLATFORM_LABEL } from '../model/format';
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
  viewsByDay
} from '../model/report';
import { useSourcesAttention } from './AnalyticsSources';
import { copy } from './copy';
import { CompareVideosPanel } from './CompareVideosPanel';
import { DynamicsPanel } from './DynamicsPanel';
import { TrendingPanel } from './TrendingPanel';
import { FollowersPanel } from './FollowersPanel';
import { InsightsPanel } from './InsightsPanel';
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
    const followersChange = followers.reduce<number | null>(
      (sum, entry) => (entry.change === null ? sum : (sum ?? 0) + entry.change),
      null
    );
    const kpis: Kpi[] = [
      {
        id: 'views',
        label: copy.kpi.views,
        value: formatCount(stats.views),
        change: before.items > 0 ? percentChange(stats.views, before.views) : null,
        hint: copy.kpi.noBase,
        series: cumulative(daily.map((entry) => entry.views)),
        tips: daily.map(
          (entry, index) =>
            `${formatDay(entry.day)}: ${formatCount(cumulative(daily.map((day) => day.views))[index] ?? 0)} всего, +${formatCount(entry.views)} за день`
        )
      },
      {
        id: 'items',
        label: copy.kpi.items,
        value: String(stats.items),
        change: before.items > 0 ? percentChange(stats.items, before.items) : null,
        hint: copy.kpi.noBase,
        series: cumulative(daily.map((entry) => entry.items)),
        tips: daily.map((entry) => `${formatDay(entry.day)}: ${entry.items} публ.`)
      },
      // One median across Telegram and YouTube means nothing (300 against 100 000): with every platform
      // shown, the tile gives the Telegram reach instead, the measure the channel's ads are sold on.
      platform === undefined
        ? telegramReachKpi(report)
        : {
            id: 'median',
            label: copy.kpi.median,
            value: formatCount(stats.medianViews),
            change: percentChange(stats.medianViews, before.medianViews),
            hint: copy.kpi.noBase
          },
      {
        id: 'engagement',
        label: copy.kpi.engagement,
        value: stats.engagement === null ? '—' : `${stats.engagement.toLocaleString('ru-RU')}%`,
        change: percentChange(stats.engagement, before.engagement),
        hint: copy.kpi.noBase
      },
      {
        id: 'followers',
        label: copy.kpi.followers,
        value: formatCount(followersNow),
        change: null,
        absolute: followersChange,
        hint: copy.kpi.followersCollecting
      }
    ];
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
      {report?.truncated ? <p className={styles.note}>{copy.truncated}</p> : null}
      <StaleRegion busy={reportQuery.isPlaceholderData}>
        <Tabs selectedKey={view.tab} onSelectionChange={(key) => onViewChange({ tab: key as AnalyticsTab })}>
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
            </div>
          </div>
          <TabPanel id="overview">
            <div className={styles.sections}>
              <Panel
                title="Сводка за период"
                headingLevel={2}
                quiet
                note={
                  report
                    ? `${days} дней по дате публикации: ${formatDay(report.from.slice(0, 10))} — ${formatDay(report.to.slice(0, 10))}`
                    : undefined
                }
              >
                <div className={styles.summaryBody}>
                  <KpiStrip kpis={derived?.kpis} days={days} />
                </div>
              </Panel>
              <InsightsPanel insights={derived?.insights} days={days} onOpenItem={open} />
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
              <PerformancePanel items={derived?.current} platform={platform} timezone={timezone} onOpen={open} />
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
                baselines={baselines}
                medians={derived?.medians ?? {}}
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

function telegramReachKpi(report: NonNullable<Parameters<typeof splitPeriods>[0]>): Kpi {
  const { current, previous } = splitPeriods(report, 'telegram');
  const followers = followersStats(report, 'telegram').now;
  const reach = (items: typeof current) => {
    const value = periodStats(items).medianViews;
    return followers === null || followers === 0 || value === null ? null : Math.round((value / followers) * 100);
  };
  const now = reach(current);
  return {
    id: 'reach',
    label: copy.kpi.reach,
    value: now === null ? '—' : `${now}%`,
    change: percentChange(now, reach(previous)),
    hint: copy.kpi.noBase
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
