import { useQuery } from '@tanstack/react-query';
import { relativeTimeRu } from '../../../shared/lib/ru-format';
import { AreaChart, Drawer, ErrorState, Icon, Skeleton } from '../../../shared/ui';
import { contentItemQueryOptions } from '../api/content-analytics-queries';
import { engagementRate, formatCount, formatExact, formatPublished, likesLabel, PLATFORM_LABEL } from '../model/format';
import { copy } from './copy';
import styles from './ContentAnalytics.module.css';
import { ItemThumb } from './ItemThumb';

type Props = {
  id: string | undefined;
  onClose: () => void;
  timezone: string;
  now: number;
};

/** One post or video: its counters and the views curve from the stored snapshots. */
export function ItemDrawer({ id, onClose, timezone, now }: Props) {
  const query = useQuery({ ...contentItemQueryOptions(id ?? ''), enabled: id !== undefined });
  const detail = query.data;
  const item = detail?.item;
  const snapshots = detail?.snapshots.filter((snapshot) => snapshot.views !== null) ?? [];
  const rate = item ? engagementRate(item) : null;

  return (
    <Drawer
      isOpen={id !== undefined}
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={item ? item.title || copy.table.untitled : copy.title}
    >
      {query.isError ? (
        <ErrorState message={copy.detail.error} onRetry={() => void query.refetch()} />
      ) : item === undefined ? (
        <div className={styles.drawerBody} aria-busy="true">
          <Skeleton height={160} radius="var(--radius-2)" />
          <Skeleton lines={3} />
        </div>
      ) : (
        <div className={styles.drawerBody}>
          <div className={styles.drawerHead}>
            <ItemThumb item={item} size="lg" />
            <div className={styles.drawerMeta}>
              <p className={styles.tileNote}>
                {PLATFORM_LABEL[item.platform]}, {formatPublished(item.publishedAt, timezone)}
              </p>
              <a className={styles.externalLink} href={item.url} target="_blank" rel="noreferrer noopener">
                {copy.detail.open(PLATFORM_LABEL[item.platform])}
                <Icon name="external" size={14} />
              </a>
            </div>
          </div>

          <dl className={styles.counters}>
            <div>
              <dt>{copy.table.views}</dt>
              <dd>{formatExact(item.views)}</dd>
            </div>
            <div>
              <dt>{likesLabel(item.platform)}</dt>
              <dd>{formatExact(item.likes)}</dd>
            </div>
            <div>
              <dt>{copy.table.comments}</dt>
              <dd>{formatExact(item.comments)}</dd>
            </div>
            <div>
              <dt>{copy.table.er}</dt>
              <dd>{rate === null ? '—' : `${rate.toLocaleString('ru-RU')} %`}</dd>
            </div>
          </dl>

          <section className={styles.growth} aria-labelledby="growth-title">
            <h3 id="growth-title" className={styles.sectionTitle}>
              {copy.detail.growth}
            </h3>
            {snapshots.length < 2 ? (
              <p className={styles.tileNote}>{copy.detail.growthEmpty}</p>
            ) : (
              <>
                <div className={styles.growthChart}>
                  <span className={styles.growthMax}>
                    {formatCount(Math.max(...snapshots.map((s) => s.views ?? 0)))}
                  </span>
                  <AreaChart
                    points={snapshots.map((snapshot) => snapshot.views ?? 0)}
                    x={snapshots.map((snapshot) => Date.parse(snapshot.observedAt))}
                    height={140}
                    baseline="zero"
                    label={copy.detail.growthLabel(formatExact(item.views))}
                  />
                </div>
                <div className={styles.growthAxis}>
                  <span>{formatPublished(snapshots[0]!.observedAt, timezone)}</span>
                  <span>{formatPublished(snapshots.at(-1)!.observedAt, timezone)}</span>
                </div>
              </>
            )}
            <p className={styles.tileUpdated}>{copy.detail.observed(relativeTimeRu(item.observedAt, now))}</p>
          </section>
        </div>
      )}
    </Drawer>
  );
}
