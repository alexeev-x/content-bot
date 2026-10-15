import type { ContentAnalyticsOverviewDto } from '@alexeev/contracts';
import { relativeTimeRu } from '../../../shared/lib/ru-format';
import { Icon, Skeleton } from '../../../shared/ui';
import { PLATFORM_LABEL } from '../model/format';
import { PLATFORMS } from '../model/report';
import { collectErrorText, copy } from './copy';
import { PlatformGlyph } from './PlatformGlyph';
import styles from './Report.module.css';

type Props = { overview: ContentAnalyticsOverviewDto | undefined; now: number };

/** One quiet line per platform: connected and fresh, not connected (with what to do) or failing (with why). */
export function SourceStatusRow({ overview, now }: Props) {
  return (
    <ul className={styles.sources} aria-label={copy.sources.label}>
      {PLATFORMS.map((platform) => {
        const source = overview?.sources.find((candidate) => candidate.platform === platform);
        const tone =
          source === undefined ? 'muted' : source.state === 'error' ? 'bad' : source.state === 'ok' ? 'good' : 'muted';
        return (
          <li key={platform} className={styles.source} data-tone={tone}>
            <PlatformGlyph platform={platform} withLabel />
            {source === undefined ? (
              <Skeleton width={120} height={12} />
            ) : (
              <span className={styles.sourceState}>
                {source.state === 'ok' ? <Icon name="check-circle" size={14} /> : null}
                {source.state === 'error' ? <Icon name="alert" size={14} /> : null}
                {source.state === 'ok' && source.lastSyncedAt
                  ? copy.updated(relativeTimeRu(source.lastSyncedAt, now))
                  : source.state === 'error'
                    ? collectErrorText(source.errorCode)
                    : source.state === 'pending'
                      ? copy.state.pending
                      : copy.state.not_configured}
              </span>
            )}
            {source?.profileUrl ? (
              <a
                className={styles.sourceLink}
                href={source.profileUrl}
                target="_blank"
                rel="noreferrer noopener"
                aria-label={copy.openProfile(PLATFORM_LABEL[platform])}
              >
                <Icon name="external" size={14} />
              </a>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
