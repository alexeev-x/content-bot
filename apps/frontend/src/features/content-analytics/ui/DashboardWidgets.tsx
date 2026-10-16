import type { ContentItemDto, ContentPlatform } from '@alexeev/contracts';
import { useQuery } from '@tanstack/react-query';
import { Button as AriaButton } from 'react-aria-components';
import { relativeTimeRu } from '../../../shared/lib/ru-format';
import { useNow } from '../../../shared/lib/use-now';
import { MediaSkeleton, Skeleton } from '../../../shared/ui';
import { contentReportQueryOptions } from '../api/content-analytics-queries';
import { engagementRate, formatCount, itemTitle, likesLabel, PLATFORM_LABEL } from '../model/format';
import { median, mediansByPlatform, percentChange, settledItems, splitPeriods } from '../model/report';
import { verdictFor } from '../model/status';
import { ItemCover } from './ItemCover';
import { StatusChip } from './StatusChip';
import styles from './DashboardWidgets.module.css';
import cardStyles from './Widgets.module.css';

function Change({ value, suffix }: { value: number | null; suffix?: string }) {
  // No comparison yet: the line keeps its height so the card is the same with and without one.
  if (value === null)
    return (
      <span className={styles.change} aria-hidden="true">
        {'\u00a0'}
      </span>
    );
  return (
    <span className={styles.change} data-tone={value > 0 ? 'up' : value < 0 ? 'down' : 'flat'}>
      {value > 0 ? '↑ +' : value < 0 ? '↓ −' : ''}
      {Math.abs(value)}%{suffix ? <span className={styles.muted}> {suffix}</span> : null}
    </span>
  );
}

/** The widget body as it will look: cover, title, status and four figures in the same boxes. */
export function LatestVideoSkeleton() {
  return (
    <div className={styles.body} aria-hidden="true">
      <div className={styles.head}>
        <span className={cardStyles.cover}>
          <MediaSkeleton />
        </span>
        <span className={styles.headText}>
          <span className={styles.titleSkeleton}>
            <Skeleton width="80%" height="2lh" />
          </span>
          <span className={styles.muted}>
            <Skeleton width={96} height="1lh" />
          </span>
          <Skeleton width={120} height={26} />
        </span>
      </div>
      <dl className={styles.metrics}>
        {[0, 1, 2, 3].map((key) => (
          <div key={key}>
            <dt>
              <Skeleton width="60%" height="1lh" />
            </dt>
            <dd>
              <Skeleton width="50%" height="1lh" />
            </dd>
            <span className={styles.change}>
              <Skeleton width="70%" height="1lh" />
            </span>
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * «Последний ролик · <платформа>»: the newest item of one platform with its status, its numbers against the
 * platform's median.
 */
export function LatestVideoSummary({ platform, onOpen }: { platform: ContentPlatform; onOpen: (id: string) => void }) {
  const report = useQuery(contentReportQueryOptions(30));
  const now = useNow().getTime();
  const current = report.data ? splitPeriods(report.data, platform).current : undefined;
  const latest = [...(current ?? [])].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))[0];
  if (report.isPending) return <LatestVideoSkeleton />;
  if (!latest) return <p className={styles.empty}>За 30 дней публикаций в {PLATFORM_LABEL[platform]} нет.</p>;
  const medians = mediansByPlatform(current ?? [], now);
  const verdict = verdictFor(latest, now, report.data?.baselines ?? [], medians);
  const peers = settledItems(current ?? [], now);
  const usualOf = (pick: (item: ContentItemDto) => number | null) =>
    median(
      peers
        .filter((item) => item.id !== latest.id)
        .map(pick)
        .filter((value): value is number => value !== null)
    );
  // A video in its first 72 hours is compared with the usual at the same age; older totals with the median.
  const young = now - Date.parse(latest.publishedAt) < 72 * 3_600_000;
  const metrics: { label: string; value: number | null; usual: number | null; percent?: boolean }[] = [
    { label: 'Просмотры', value: latest.views, usual: young ? verdict.usual : usualOf((item) => item.views) },
    { label: likesLabel(platform), value: latest.likes, usual: young ? null : usualOf((item) => item.likes) },
    { label: 'Комментарии', value: latest.comments, usual: young ? null : usualOf((item) => item.comments) },
    { label: 'ER', value: engagementRate(latest), usual: usualOf((item) => engagementRate(item)), percent: true }
  ].filter((metric) => metric.value !== null);
  return (
    <div className={styles.body}>
      <AriaButton className={styles.head} onPress={() => onOpen(latest.id)}>
        <ItemCover item={latest} />
        <span className={styles.headText}>
          <span className={styles.title}>{itemTitle(latest)}</span>
          <span className={styles.muted}>{relativeTimeRu(latest.publishedAt, now)}</span>
          <StatusChip verdict={verdict} withMultiple />
        </span>
      </AriaButton>
      <dl className={styles.metrics}>
        {metrics.map((metric) => (
          <div key={metric.label}>
            <dt>{metric.label}</dt>
            <dd>{metric.percent ? `${(metric.value ?? 0).toLocaleString('ru-RU')}%` : formatCount(metric.value)}</dd>
            <Change value={metric.usual ? percentChange(metric.value, metric.usual) : null} suffix="чем обычно" />
          </div>
        ))}
      </dl>
    </div>
  );
}
