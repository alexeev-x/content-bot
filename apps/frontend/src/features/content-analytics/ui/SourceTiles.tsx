import type { ContentAnalyticsOverviewDto, ContentSourceDto } from '@alexeev/contracts';
import { relativeTimeRu } from '../../../shared/lib/ru-format';
import { AreaChart, Icon, Skeleton } from '../../../shared/ui';
import { formatCount, formatDelta, PLATFORM_LABEL } from '../model/format';
import { collectErrorText, copy } from './copy';
import styles from './ContentAnalytics.module.css';
import { PlatformGlyph } from './PlatformGlyph';

type Props = {
  overview: ContentAnalyticsOverviewDto | undefined;
  now: number;
  /** Dashboard widget: no 7-day views line and a shorter chart. */
  compact?: boolean;
};

const PLATFORMS = ['telegram', 'youtube', 'tiktok'] as const;

/** One row of metric cells, one per platform (Cloudflare «Metrics» strip): the follower count, its weekly change and the 30-day curve. */
export function SourceTiles({ overview, now, compact = false }: Props) {
  return (
    <ul className={compact ? styles.tilesCompact : styles.tiles}>
      {PLATFORMS.map((platform) => {
        const source = overview?.sources.find((candidate) => candidate.platform === platform);
        const points = overview?.followers.find((series) => series.platform === platform)?.points ?? [];
        return (
          <li key={platform} className={styles.tile}>
            <div className={styles.tileHead}>
              <PlatformGlyph platform={platform} withLabel />
              {source?.profileUrl && !compact ? (
                <a
                  className={styles.tileLink}
                  href={source.profileUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  aria-label={copy.openProfile(PLATFORM_LABEL[platform])}
                >
                  <Icon name="external" size={14} />
                </a>
              ) : null}
            </div>
            {source === undefined ? (
              <TileSkeleton />
            ) : (
              <TileBody source={source} now={now} compact={compact} points={points.map((point) => point.followers)} />
            )}
          </li>
        );
      })}
    </ul>
  );
}

function TileSkeleton() {
  return (
    <div className={styles.tileBody}>
      <Skeleton width="50%" height={28} />
      <Skeleton width="70%" height={14} />
      <div className={styles.tileChart}>
        <AreaChart points={[]} height={36} />
      </div>
    </div>
  );
}

function TileBody({
  source,
  now,
  compact,
  points
}: {
  source: ContentSourceDto;
  now: number;
  compact: boolean;
  points: number[];
}) {
  if (source.state === 'not_configured') {
    return (
      <div className={styles.tileBody}>
        <p className={styles.tileValueMuted}>{copy.state.not_configured}</p>
        {compact ? null : <p className={styles.tileNote}>{copy.setup[source.platform]}</p>}
      </div>
    );
  }
  const change = source.followersChange7d;
  const tone = change === null || change === 0 ? 'flat' : change > 0 ? 'up' : 'down';
  return (
    <div className={styles.tileBody}>
      <p className={styles.tileValue}>
        {formatCount(source.followers)}
        <span className={compact ? styles.srOnly : styles.tileUnit}> {copy.followers}</span>
      </p>
      {change === null ? (
        compact ? null : (
          <p className={styles.tileNote}>{source.state === 'pending' ? copy.state.pending : copy.noHistory}</p>
        )
      ) : (
        <p className={styles.delta} data-tone={tone}>
          {tone === 'flat' ? null : <Icon name={tone === 'up' ? 'arrow-up' : 'arrow-down'} size={14} />}
          {formatDelta(change)}
          <span className={compact ? styles.srOnly : undefined}> {copy.week}</span>
        </p>
      )}
      {source.state === 'error' ? (
        <p className={styles.tileError}>
          <Icon name="alert" size={14} />
          {collectErrorText(source.errorCode)}
        </p>
      ) : null}
      {compact ? null : (
        <dl className={styles.tileStats}>
          <div>
            <dt>{copy.views7d}</dt>
            <dd>{formatCount(source.views7d)}</dd>
          </div>
          <div>
            <dt>{copy.items7d}</dt>
            <dd>{source.items7d}</dd>
          </div>
        </dl>
      )}
      {compact ? null : (
        <p className={styles.tileUpdated}>
          {source.lastSyncedAt ? copy.updated(relativeTimeRu(source.lastSyncedAt, now)) : copy.neverUpdated}
        </p>
      )}
      <div className={styles.tileChart}>
        <AreaChart points={points} height={compact ? 28 : 40} />
      </div>
    </div>
  );
}
