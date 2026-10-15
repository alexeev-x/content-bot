import type { ContentPlatform, ContentReportDto } from '@alexeev/contracts';
import { useMemo } from 'react';
import { DataTable, type DataColumn, Panel } from '../../../shared/ui';
import { formatCount, PLATFORM_LABEL } from '../model/format';
import { followersStats, percentChange, periodStats, PLATFORMS, splitPeriods } from '../model/report';
import { copy } from './copy';
import styles from './Report.module.css';

type Row = {
  platform: ContentPlatform;
  followers: number | null;
  followersChange: number | null;
  items: number;
  views: number;
  viewsChange: number | null;
  medianViews: number | null;
  engagement: number | null;
  /** Median views per post against followers: the share of the audience a post reaches. */
  reach: number | null;
};

type Props = { report: ContentReportDto | undefined };

function change(value: number | null): string {
  if (value === null) return '';
  return ` (${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value)}%)`;
}

/** The platforms side by side for the same period (TGStat-style reach and engagement included). */
export function PlatformComparison({ report }: Props) {
  const rows = useMemo<Row[]>(() => {
    if (!report) return [];
    return PLATFORMS.map((platform) => {
      const { current, previous } = splitPeriods(report, platform);
      const now = periodStats(current);
      const before = periodStats(previous);
      const followers = followersStats(report, platform);
      return {
        platform,
        followers: followers.now,
        followersChange: followers.change,
        items: now.items,
        views: now.views,
        viewsChange: percentChange(now.views, before.items > 0 ? before.views : null),
        medianViews: now.medianViews,
        engagement: now.engagement,
        // Reach is a Telegram measure: a post goes to subscribers. Shorts are shown to strangers, so
        // views over subscribers would read as thousands of percent there.
        reach:
          platform === 'telegram' && followers.now !== null && followers.now > 0 && now.medianViews !== null
            ? Math.round((now.medianViews / followers.now) * 100)
            : null
      };
    }).filter((row) => row.followers !== null || row.items > 0);
  }, [report]);

  const columns = useMemo<DataColumn<Row>[]>(
    () => [
      { id: 'platform', header: copy.compare.platform, isRowHeader: true, cell: (row) => PLATFORM_LABEL[row.platform] },
      {
        id: 'followers',
        header: copy.compare.followers,
        align: 'end',
        cell: (row) => (
          <span className={styles.num}>
            {formatCount(row.followers)}
            {row.followersChange !== null ? (
              <span
                className={styles.cellDelta}
                data-tone={row.followersChange > 0 ? 'up' : row.followersChange < 0 ? 'down' : 'flat'}
              >
                {' '}
                {row.followersChange > 0 ? '+' : row.followersChange < 0 ? '−' : ''}
                {formatCount(Math.abs(row.followersChange))}
              </span>
            ) : null}
          </span>
        )
      },
      {
        id: 'items',
        header: copy.compare.items,
        align: 'end',
        cell: (row) => <span className={styles.num}>{row.items}</span>
      },
      {
        id: 'views',
        header: copy.compare.views,
        align: 'end',
        compactSlot: 'trailing',
        cell: (row) => (
          <span className={styles.num}>
            {formatCount(row.views)}
            <span
              className={styles.cellDelta}
              data-tone={row.viewsChange === null ? 'flat' : row.viewsChange > 0 ? 'up' : 'down'}
            >
              {change(row.viewsChange)}
            </span>
          </span>
        )
      },
      {
        id: 'median',
        header: copy.compare.median,
        align: 'end',
        cell: (row) => <span className={styles.num}>{formatCount(row.medianViews)}</span>
      },
      {
        id: 'engagement',
        header: copy.compare.engagement,
        align: 'end',
        cell: (row) => (
          <span className={styles.num}>
            {row.engagement === null ? '—' : `${row.engagement.toLocaleString('ru-RU')}%`}
          </span>
        )
      },
      {
        id: 'reach',
        header: copy.compare.reach,
        align: 'end',
        cell: (row) => <span className={styles.num}>{row.reach === null ? '—' : `${row.reach}%`}</span>
      }
    ],
    []
  );

  return (
    <Panel title={copy.compare.title} headingLevel={2} quiet note={copy.compare.note}>
      <DataTable
        aria-label={copy.compare.title}
        columns={columns}
        rows={rows}
        getRowId={(row) => row.platform}
        isLoading={report === undefined}
        loadingRows={2}
        density="compact"
        flush
      />
    </Panel>
  );
}
