import type { ContentPlatform, ContentReportDto } from '@alexeev/contracts';
import { AreaChart, Panel } from '../../../shared/ui';
import { formatCount, formatDay, PLATFORM_LABEL } from '../model/format';
import { followersStats, PLATFORMS } from '../model/report';
import { PlatformLogo } from './PlatformLogo';
import styles from './Audience.module.css';
import { PanelSkeleton } from './PanelSkeleton';

type Props = { report: ContentReportDto | undefined; platform: ContentPlatform | undefined };

const COLOR: Record<ContentPlatform, string> = {
  telegram: 'var(--color-platform-telegram)',
  youtube: 'var(--color-platform-youtube)',
  tiktok: 'var(--color-series-3)'
};

/** Followers per platform: the count, its change over the period and the daily curve in the platform's colour. */
export function FollowersPanel({ report, platform }: Props) {
  // A platform without any stored count (not connected) has nothing to draw.
  const platforms = PLATFORMS.filter(
    (each) =>
      (platform === undefined || platform === each) &&
      (report === undefined || followersStats(report, each).now !== null)
  );
  if (report === undefined)
    return <PanelSkeleton title="Подписчики" note="Динамика и прирост за период" rows={3.5} phoneRows={3.7} />;
  return (
    <Panel title="Подписчики" headingLevel={2} quiet note="Динамика и прирост за период">
      <ul className={styles.followers}>
        {platforms.map((each) => {
          const stats = report ? followersStats(report, each) : undefined;
          const first = stats?.points[0];
          const base = stats && stats.now !== null && stats.change !== null ? stats.now - stats.change : null;
          const percent =
            base && stats?.change !== null && stats?.change !== undefined
              ? Math.round((stats.change / base) * 1000) / 10
              : null;
          return (
            <li key={each} className={styles.follower}>
              <PlatformLogo platform={each} size={36} />
              <span className={styles.followerText}>
                <span className={styles.followerName}>{PLATFORM_LABEL[each]}</span>
                <strong>{formatCount(stats?.now ?? null)}</strong>
                {stats?.change !== null && stats?.change !== undefined ? (
                  <span
                    data-tone={stats.change > 0 ? 'up' : stats.change < 0 ? 'down' : 'flat'}
                    className={styles.delta}
                  >
                    {stats.change > 0 ? '+' : stats.change < 0 ? '−' : ''}
                    {formatCount(Math.abs(stats.change))}
                    {percent !== null ? ` (${percent > 0 ? '+' : ''}${percent.toLocaleString('ru-RU')}%)` : ''}
                  </span>
                ) : null}
              </span>
              {stats && stats.points.length >= 2 ? (
                <span className={styles.followerChart}>
                  <AreaChart
                    points={stats.points.map((point) => point.followers)}
                    height={48}
                    color={COLOR[each]}
                    label={`${PLATFORM_LABEL[each]}: подписчики по дням`}
                    tips={stats.points.map((point) => `${formatDay(point.day)}: ${formatCount(point.followers)}`)}
                  />
                </span>
              ) : (
                <span className={styles.note}>
                  История копится{first ? ` с ${formatDay(first.day)}` : ''}: график появится со второго дня.
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
