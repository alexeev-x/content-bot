import type { ContentPlatform, ContentReportDto } from '@alexeev/contracts';
import { useState } from 'react';
import { AreaChart, Checkbox, LineChart, Panel } from '../../../shared/ui';
import { formatCount, formatDay, PLATFORM_LABEL } from '../model/format';
import { percentChange, PLATFORMS } from '../model/report';
import { PlatformLogo } from './PlatformLogo';
import styles from './Dynamics.module.css';
import { PanelSkeleton } from './PanelSkeleton';

type Props = {
  report: ContentReportDto | undefined;
  platform: ContentPlatform | undefined;
  days: number;
};

const DAY = 86_400_000;
const COLOR: Record<ContentPlatform, string> = {
  telegram: 'var(--color-platform-telegram)',
  youtube: 'var(--color-platform-youtube)',
  tiktok: 'var(--color-series-3)'
};

function dayKeys(from: string, count: number): string[] {
  const start = Date.parse(`${from.slice(0, 10)}T00:00:00Z`);
  return Array.from({ length: count }, (_, index) => new Date(start + index * DAY).toISOString().slice(0, 10));
}

/**
 * «Динамика по платформам»: views gained per day on each platform (from the daily readings, so an old
 * video still growing counts every day), with the period's total and its change beside it; a platform
 * can be hidden from the chart.
 */
export function DynamicsPanel({ report, platform, days }: Props) {
  const [hidden, setHidden] = useState<ReadonlySet<ContentPlatform>>(new Set());
  if (!report) {
    return (
      <PanelSkeleton
        title="Динамика по платформам"
        note="Сколько просмотров набрали за день публикации младше 30 дней"
        rows={5.1}
        phoneRows={8.7}
      />
    );
  }
  const platforms = PLATFORMS.filter(
    (each) => (platform === undefined || platform === each) && report.growth.some((row) => row.platform === each)
  );
  const nowDays = dayKeys(report.from, days + 1);
  const beforeDays = new Set(dayKeys(report.previousFrom, days));
  const measuredDays = nowDays.filter((day) => report.growth.some((row) => row.day === day));
  const start = nowDays.indexOf(measuredDays[0] ?? nowDays[0]!);
  const shownDays = nowDays.slice(Math.max(0, start));
  const rows = platforms.map((each) => {
    const byDay = new Map(report.growth.filter((row) => row.platform === each).map((row) => [row.day, row.views]));
    const series = shownDays.map((day) => byDay.get(day) ?? 0);
    const total = shownDays.reduce((sum, day) => sum + (byDay.get(day) ?? 0), 0);
    const before = [...byDay].filter(([day]) => beforeDays.has(day)).reduce((sum, [, views]) => sum + views, 0);
    return { platform: each, series, total, change: before > 0 ? percentChange(total, before) : null };
  });

  return (
    <Panel
      title="Динамика по платформам"
      headingLevel={2}
      quiet
      note="Сколько просмотров набрали за день публикации младше 30 дней"
    >
      <div className={styles.layout}>
        <div className={styles.chart}>
          {measuredDays.length < 2 ? (
            <p className={styles.muted}>
              Прирост считается по ежедневным замерам{measuredDays[0] ? ` с ${formatDay(measuredDays[0])}` : ''}: график
              появится со второго дня.
            </p>
          ) : (
            <LineChart
              label="Прирост просмотров по дням и платформам"
              series={rows
                .filter((row) => !hidden.has(row.platform))
                .map((row) => ({
                  id: row.platform,
                  label: PLATFORM_LABEL[row.platform],
                  points: row.series.map((views, index) => ({
                    x: Date.parse(`${shownDays[index]}T12:00:00Z`),
                    y: views
                  })),
                  color: COLOR[row.platform],
                  area: true
                }))}
              formatX={(x) => formatDay(new Date(x).toISOString().slice(0, 10))}
              formatY={formatCount}
              height={240}
              endLabels={false}
            />
          )}
        </div>
        <aside className={styles.totals} aria-label="Итого за период">
          <h3 className={styles.totalsTitle}>Итого за период</h3>
          <ul className={styles.rows}>
            {rows.map((row) => (
              <li key={row.platform} className={styles.row}>
                <PlatformLogo platform={row.platform} size={28} />
                <span className={styles.rowText}>
                  <span className={styles.rowName}>{PLATFORM_LABEL[row.platform]}</span>
                  <strong>{formatCount(row.total)}</strong>
                </span>
                <span
                  className={styles.rowChange}
                  data-tone={row.change === null ? 'flat' : row.change >= 0 ? 'up' : 'down'}
                >
                  {row.change === null
                    ? '—'
                    : `${row.change > 0 ? '↑ +' : row.change < 0 ? '↓ −' : ''}${Math.abs(row.change)}%`}
                </span>
                <span className={styles.rowSpark}>
                  <AreaChart points={row.series} height={28} color={COLOR[row.platform]} />
                </span>
                <Checkbox
                  aria-label={`Показать ${PLATFORM_LABEL[row.platform]} на графике`}
                  isSelected={!hidden.has(row.platform)}
                  onChange={(on) =>
                    setHidden((current) => {
                      const next = new Set(current);
                      if (on) next.delete(row.platform);
                      else next.add(row.platform);
                      return next;
                    })
                  }
                />
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </Panel>
  );
}
