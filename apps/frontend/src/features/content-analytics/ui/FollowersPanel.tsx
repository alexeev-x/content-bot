import type { ContentPlatform, ContentReportDto } from '@alexeev/contracts';
import { AreaChart, Panel } from '../../../shared/ui';
import { formatCount, formatDay, PLATFORM_LABEL } from '../model/format';
import { followersStats, PLATFORMS } from '../model/report';
import { copy } from './copy';
import styles from './Report.module.css';

type Props = { report: ContentReportDto | undefined; platform: ContentPlatform | undefined };

/** Daily followers per platform; until two days are stored it says when the history started. */
export function FollowersPanel({ report, platform }: Props) {
  // A platform without any stored count (not connected) has nothing to draw.
  const platforms = PLATFORMS.filter(
    (each) =>
      (platform === undefined || platform === each) &&
      (report === undefined || followersStats(report, each).now !== null)
  );
  return (
    <Panel title={copy.followersPanel.title} headingLevel={2} quiet>
      <div className={styles.followers}>
        {platforms.map((each) => {
          const stats = report ? followersStats(report, each) : undefined;
          const first = stats?.points[0];
          const last = stats?.points.at(-1);
          return (
            <section key={each} className={styles.followerCell} aria-label={PLATFORM_LABEL[each]}>
              <h3 className={styles.multipleTitle}>{PLATFORM_LABEL[each]}</h3>
              <p className={styles.followerValue}>
                {formatCount(stats?.now ?? null)}
                {stats?.change !== null && stats?.change !== undefined ? (
                  <span data-tone={stats.change > 0 ? 'up' : stats.change < 0 ? 'down' : 'flat'}>
                    {stats.change > 0 ? '+' : stats.change < 0 ? '−' : ''}
                    {formatCount(Math.abs(stats.change))}
                  </span>
                ) : null}
              </p>
              {stats && stats.points.length >= 2 ? (
                <>
                  <AreaChart
                    points={stats.points.map((point) => point.followers)}
                    height={64}
                    tips={stats.points.map(
                      (point) => `${formatDay(point.day)}: ${formatCount(point.followers)} подписчиков`
                    )}
                    label={copy.followersPanel.chartLabel(PLATFORM_LABEL[each], formatCount(stats.now))}
                  />
                  <div className={styles.axisRow} aria-hidden="true">
                    <span>{first ? formatDay(first.day) : ''}</span>
                    <span>{last ? formatDay(last.day) : ''}</span>
                  </div>
                </>
              ) : (
                <p className={styles.note}>
                  {stats?.now === null || stats === undefined
                    ? copy.followersPanel.none
                    : copy.followersPanel.collecting(first ? formatDay(first.day) : '')}
                </p>
              )}
            </section>
          );
        })}
      </div>
    </Panel>
  );
}
