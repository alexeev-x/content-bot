import type { ContentPlatform, ContentReportDto } from '@alexeev/contracts';
import { type ReactNode, useMemo } from 'react';
import { DataTable, type DataColumn, Panel } from '../../../shared/ui';
import { formatCount } from '../model/format';
import { followersStats, percentChange, periodStats, PLATFORMS, splitPeriods } from '../model/report';
import { PlatformGlyph } from './PlatformGlyph';
import styles from './Report.module.css';
import widgets from './Widgets.module.css';
import { PanelSkeleton } from './PanelSkeleton';

type Row = {
  platform: ContentPlatform;
  followers: number | null;
  followersChange: number | null;
  items: number;
  itemsChange: number | null;
  views: number;
  viewsChange: number | null;
  medianViews: number | null;
  engagement: number | null;
  engagementChange: number | null;
  /** Views of the period per follower: how far beyond its own audience a platform reaches. */
  perFollower: number | null;
  connected: boolean;
};

function Value({ value, change, unit = '%' }: { value: ReactNode; change: number | null; unit?: string }) {
  return (
    <span className={styles.cellStack}>
      <span className={styles.num}>{value}</span>
      {change !== null ? (
        <span className={styles.cellDelta} data-tone={change > 0 ? 'up' : change < 0 ? 'down' : 'flat'}>
          {change > 0 ? '↑ +' : change < 0 ? '↓ −' : ''}
          {Math.abs(change).toLocaleString('ru-RU')}
          {unit}
        </span>
      ) : null}
    </span>
  );
}

export function comparisonRows(report: ContentReportDto): Row[] {
  return PLATFORMS.map((platform) => {
    const { current, previous } = splitPeriods(report, platform);
    const now = periodStats(current);
    const before = periodStats(previous);
    const followers = followersStats(report, platform);
    const base = followers.now !== null && followers.change !== null ? followers.now - followers.change : null;
    return {
      platform,
      followers: followers.now,
      followersChange:
        base !== null && base > 0 && followers.change !== null ? Math.round((followers.change / base) * 100) : null,
      items: now.items,
      itemsChange: before.items > 0 ? percentChange(now.items, before.items) : null,
      views: now.views,
      viewsChange: before.items > 0 ? percentChange(now.views, before.views) : null,
      medianViews: now.medianViews,
      engagement: now.engagement,
      engagementChange:
        now.engagement !== null && before.engagement !== null
          ? Math.round((now.engagement - before.engagement) * 10) / 10
          : null,
      perFollower:
        followers.now !== null && followers.now > 0 ? Math.round((now.views / followers.now) * 10) / 10 : null,
      connected: followers.now !== null || now.items > 0
    };
  });
}

/** Platforms side by side for the same period, each number with its change against the previous one. */
export function PlatformComparison({ report }: { report: ContentReportDto | undefined }) {
  const rows = useMemo(() => (report ? comparisonRows(report) : []), [report]);
  const columns = useMemo<DataColumn<Row>[]>(
    () => [
      {
        id: 'platform',
        header: 'Платформа',
        isRowHeader: true,
        width: 150,
        cell: (row) => <PlatformGlyph platform={row.platform} withLabel />
      },
      {
        id: 'followers',
        header: 'Подписчики',
        cell: (row) =>
          row.connected ? (
            <Value value={formatCount(row.followers)} change={row.followersChange} />
          ) : (
            <span className={widgets.small}>Не подключено</span>
          )
      },
      { id: 'items', header: 'Публикаций', cell: (row) => <Value value={row.items} change={row.itemsChange} /> },
      {
        id: 'views',
        header: 'Просмотры',
        compactSlot: 'trailing',
        cell: (row) => <Value value={formatCount(row.views)} change={row.viewsChange} />
      },
      {
        id: 'median',
        header: 'Медиана',
        cell: (row) => <span className={styles.num}>{formatCount(row.medianViews)}</span>
      },
      {
        id: 'engagement',
        header: 'Вовлечённость',
        cell: (row) => (
          <Value
            value={row.engagement === null ? '—' : `${row.engagement.toLocaleString('ru-RU')}%`}
            change={row.engagementChange}
            unit=" п.п."
          />
        )
      },
      {
        id: 'perFollower',
        header: 'На подписчика',
        cell: (row) => (
          <span className={styles.num}>{row.perFollower === null ? '—' : row.perFollower.toLocaleString('ru-RU')}</span>
        )
      }
    ],
    []
  );
  if (report === undefined)
    return (
      <PanelSkeleton
        title="Сравнение платформ"
        note="Под значением — изменение к прошлому периоду"
        rows={3.2}
        phoneRows={16.5}
      />
    );
  return (
    <Panel title="Сравнение платформ" headingLevel={2} quiet note="Под значением — изменение к прошлому периоду">
      <div className={styles.tableInset}>
        <DataTable
          aria-label="Сравнение платформ"
          columns={columns}
          rows={rows}
          getRowId={(row) => row.platform}
          isLoading={report === undefined}
          loadingRows={3}
          flush
        />
      </div>
    </Panel>
  );
}
