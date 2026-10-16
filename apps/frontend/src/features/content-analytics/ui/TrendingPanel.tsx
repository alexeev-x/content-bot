import type { ContentBaselineDto, ContentItemDto, ContentPlatform } from '@alexeev/contracts';
import { useQueries } from '@tanstack/react-query';
import { Button as AriaButton } from 'react-aria-components';
import { relativeTimeRu } from '../../../shared/lib/ru-format';
import { useState } from 'react';
import { AreaChart, Icon, MediaSkeleton, Panel, SegmentedControl, Skeleton } from '../../../shared/ui';
import { PLATFORMS } from '../model/report';
import { contentItemQueryOptions } from '../api/content-analytics-queries';
import { ageCurve, formatAge } from '../model/curves';
import { formatCount, formatPublished, formatViews, itemTitle, PLATFORM_LABEL } from '../model/format';
import { type ItemVerdict, verdictFor, YOUNG_HOURS } from '../model/status';
import { ItemCover } from './ItemCover';
import { PlatformGlyph } from './PlatformGlyph';
import { StatusChip } from './StatusChip';
import styles from './Widgets.module.css';

type Props = {
  items: readonly ContentItemDto[] | undefined;
  baselines: readonly ContentBaselineDto[];
  medians: Partial<Record<ContentPlatform, number | null>>;
  now: number;
  timezone: string;
  onOpen: (id: string) => void;
  /** Dashboard: a link to the whole page under the list. */
  onOpenAll?: () => void;
  limit?: number;
  /** Text of the link under the list (with `onOpenAll`). */
  allLabel?: string;
  /** Inside a dashboard widget that already draws the frame and the title. */
  bare?: boolean;
};

const ORDER: Record<ItemVerdict['status'], number> = { rising: 0, normal: 1, collecting: 2, below: 3 };

/** The rows of the list as they will look: the same row grid, so the data replaces them in place. */
export function TrendingRowsSkeleton({ count }: { count: number }) {
  return (
    <ul className={`${styles.rows} ${styles.trendList}`} aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <li key={index}>
          <div className={styles.trendRow}>
            <span className={styles.cover}>
              <MediaSkeleton />
            </span>
            <span className={styles.text}>
              <span className={styles.trendTitle}>
                <Skeleton width="55%" height="1lh" />
              </span>
              <span className={styles.meta}>
                <Skeleton width="30%" height="1lh" />
              </span>
            </span>
            <span className={styles.trendViews}>
              <strong>
                <Skeleton width={56} height="1lh" />
              </strong>
              <span className={styles.small}>
                <Skeleton width={36} height="1lh" />
              </span>
            </span>
            <span className={styles.trendStatus}>
              <Skeleton width={110} height={26} />
              <span className={styles.small}>
                <Skeleton width={190} height="1lh" />
              </span>
            </span>
            <span className={styles.trendSpark}>
              <Skeleton width="100%" height={28} />
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** «Что залетает сейчас»: the newest publications (first 72 hours) against the usual at the same age. */
export function TrendingPanel({
  items,
  baselines,
  medians,
  now,
  timezone,
  onOpen,
  onOpenAll,
  limit = 3,
  allLabel = 'Открыть аналитику',
  bare = false
}: Props) {
  const [only, setOnly] = useState<ContentPlatform | 'all'>('all');
  const young = (items ?? [])
    .filter((item) => only === 'all' || item.platform === only)
    .filter((item) => now - Date.parse(item.publishedAt) < YOUNG_HOURS * 3_600_000)
    .map((item) => ({ item, verdict: verdictFor(item, now, baselines, medians) }))
    .sort(
      (a, b) =>
        ORDER[a.verdict.status] - ORDER[b.verdict.status] || (b.verdict.multiple ?? 0) - (a.verdict.multiple ?? 0)
    )
    .slice(0, limit);
  const details = useQueries({ queries: young.map(({ item }) => contentItemQueryOptions(item.id)) });

  const content = (
    <div className={styles.body}>
      {items === undefined ? (
        <TrendingRowsSkeleton count={limit} />
      ) : young.length === 0 ? (
        <p className={styles.muted}>За последние 72 часа публикаций нет.</p>
      ) : (
        <ul className={`${styles.rows} ${styles.trendList}`}>
          {young.map(({ item, verdict }, index) => {
            const detail = details[index]?.data;
            const points = detail ? ageCurve(detail) : [];
            const curve = points.map((point) => point.y);
            return (
              <li key={item.id}>
                <AriaButton className={styles.trendRow} onPress={() => onOpen(item.id)}>
                  <ItemCover item={item} />
                  <span className={styles.text}>
                    <span className={styles.trendTitle} title={item.title || undefined}>
                      {itemTitle(item)}
                    </span>
                    <span className={styles.meta}>
                      <PlatformGlyph platform={item.platform} size={14} withLabel />
                      <span aria-hidden="true">•</span>
                      {relativeTimeRu(item.publishedAt, now)}
                      <span className={styles.srOnly}>, {formatPublished(item.publishedAt, timezone)}</span>
                    </span>
                  </span>
                  <span className={styles.trendViews}>
                    <strong>{formatViews(item)}</strong>
                    <span className={styles.small}>просм.</span>
                  </span>
                  <span className={styles.trendStatus}>
                    <StatusChip verdict={verdict} />
                    {verdict.multiple !== null ? (
                      <span className={styles.small}>
                        <strong className={styles.num}>{verdict.multiple.toLocaleString('ru-RU')}×</strong>{' '}
                        {verdict.basis === 'age' ? 'к обычному на том же возрасте' : 'к медиане периода'}
                      </span>
                    ) : null}
                  </span>
                  <span className={styles.trendSpark}>
                    <AreaChart
                      points={curve}
                      x={points.map((point) => point.x)}
                      tips={points.map((point) => `${formatAge(point.x)}: ${formatCount(point.y)}`)}
                      height={28}
                      label={`${PLATFORM_LABEL[item.platform]}: рост просмотров`}
                    />
                  </span>
                </AriaButton>
              </li>
            );
          })}
        </ul>
      )}
      <div className={styles.footer}>
        <span className={styles.small}>
          <Icon name="info" size={14} /> Сравнение на одинаковом возрасте: 1 ч, 3 ч, 6 ч … 72 ч
        </span>
        {onOpenAll ? (
          <AriaButton className={styles.link} onPress={onOpenAll}>
            {allLabel} <Icon name="arrow-right" size={14} />
          </AriaButton>
        ) : null}
      </div>
    </div>
  );
  if (bare) return content;
  return (
    <Panel
      title="Что залетает сейчас"
      headingLevel={2}
      quiet
      note="Последние 72 часа"
      action={
        <SegmentedControl
          label="Платформа"
          options={[
            { id: 'all', label: 'Все' },
            ...PLATFORMS.map((each) => ({ id: each, label: PLATFORM_LABEL[each] }))
          ]}
          value={only}
          onChange={(id) => setOnly(id as ContentPlatform | 'all')}
        />
      }
    >
      {content}
    </Panel>
  );
}
