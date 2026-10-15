import type { ContentBaselineDto, ContentItemDto, ContentPlatform } from '@alexeev/contracts';
import { useQueries } from '@tanstack/react-query';
import { Button as AriaButton } from 'react-aria-components';
import { relativeTimeRu } from '../../../shared/lib/ru-format';
import { AreaChart, Icon, Panel, Skeleton } from '../../../shared/ui';
import { contentItemQueryOptions } from '../api/content-analytics-queries';
import { ageCurve, formatAge } from '../model/curves';
import { formatCount, formatPublished, PLATFORM_LABEL } from '../model/format';
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
  const young = (items ?? [])
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
        <Skeleton lines={3} height={48} />
      ) : young.length === 0 ? (
        <p className={styles.muted}>За последние 72 часа публикаций нет.</p>
      ) : (
        <ul className={styles.rows}>
          {young.map(({ item, verdict }, index) => {
            const detail = details[index]?.data;
            const points = detail ? ageCurve(detail) : [];
            const curve = points.map((point) => point.y);
            return (
              <li key={item.id}>
                <AriaButton className={styles.row} onPress={() => onOpen(item.id)}>
                  <ItemCover item={item} />
                  <span className={styles.text}>
                    <span className={styles.meta}>
                      <PlatformGlyph platform={item.platform} withLabel />
                    </span>
                    <span className={styles.title}>{item.title || 'Без текста'}</span>
                    <span className={styles.meta}>
                      {formatPublished(item.publishedAt, timezone)}
                      <span aria-hidden="true">•</span>
                      {relativeTimeRu(item.publishedAt, now)}
                    </span>
                  </span>
                  <span className={styles.side}>
                    <strong>{formatCount(item.views)}</strong>
                    <span className={styles.small}>просмотров</span>
                    <StatusChip verdict={verdict} withMultiple />
                    <span className={styles.spark}>
                      <AreaChart
                        points={curve}
                        x={points.map((point) => point.x)}
                        tips={points.map((point) => `${formatAge(point.x)}: ${formatCount(point.y)}`)}
                        height={36}
                        label={`${PLATFORM_LABEL[item.platform]}: рост просмотров`}
                      />
                    </span>
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
    <Panel title="Что залетает сейчас" headingLevel={2} quiet note="Последние 72 часа">
      {content}
    </Panel>
  );
}
