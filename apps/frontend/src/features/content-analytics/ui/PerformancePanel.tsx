import type { ContentItemDto, ContentPlatform } from '@alexeev/contracts';
import { BarChart, Panel } from '../../../shared/ui';
import { formatCount, formatPublished, likesLabel, PLATFORM_LABEL } from '../model/format';
import { median, PLATFORMS } from '../model/report';
import { copy } from './copy';
import styles from './Report.module.css';

type Props = {
  items: readonly ContentItemDto[] | undefined;
  platform: ContentPlatform | undefined;
  timezone: string;
  onOpen: (id: string) => void;
};

/**
 * «Каждая публикация»: one bar per post or video in publishing order against the platform's median,
 * so hits and misses read at a glance. Platforms differ by orders of magnitude, so each gets its own
 * chart (small multiples) instead of sharing one axis.
 */
export function PerformancePanel({ items, platform, timezone, onOpen }: Props) {
  const platforms = PLATFORMS.filter(
    (each) => (platform === undefined || platform === each) && (items ?? []).some((item) => item.platform === each)
  );
  return (
    <Panel title={copy.performance.title} headingLevel={2} quiet note={copy.performance.note}>
      <div className={styles.panelBody}>
        <ul className={styles.legend} aria-label={copy.performance.legend}>
          <li>
            <span className={styles.legendStrong} aria-hidden="true" />
            {copy.performance.strong}
          </li>
          <li>
            <span className={styles.legendSoft} aria-hidden="true" />
            {copy.performance.soft}
          </li>
          <li>
            <span className={styles.legendLine} aria-hidden="true" />
            {copy.performance.median}
          </li>
        </ul>
        {items === undefined ? (
          <div className={styles.chartSkeleton} aria-hidden="true" />
        ) : platforms.length === 0 ? (
          <p className={styles.empty}>{copy.performance.empty}</p>
        ) : (
          platforms.map((each) => {
            const own = items
              .filter((item) => item.platform === each && item.views !== null)
              .sort((a, b) => Date.parse(a.publishedAt) - Date.parse(b.publishedAt));
            const usual = median(own.map((item) => item.views ?? 0)) ?? 0;
            const first = own[0];
            const last = own.at(-1);
            return (
              <section key={each} className={styles.multiple} aria-label={PLATFORM_LABEL[each]}>
                <h3 className={styles.multipleTitle}>
                  {PLATFORM_LABEL[each]}
                  <span>{copy.performance.summary(own.length, formatCount(usual))}</span>
                </h3>
                <BarChart
                  label={copy.performance.chartLabel(PLATFORM_LABEL[each], own.length, formatCount(usual))}
                  bars={own.map((item) => {
                    const multiple = usual > 0 ? (item.views ?? 0) / usual : null;
                    return {
                      id: item.id,
                      value: item.views ?? 0,
                      strong: multiple !== null && multiple >= 1.5,
                      title: item.title || copy.table.untitled,
                      lines: [
                        formatPublished(item.publishedAt, timezone),
                        `${formatCount(item.views)} просмотров`,
                        multiple === null ? '' : copy.performance.multiple(multiple),
                        item.likes === null ? '' : `${likesLabel(item.platform)}: ${formatCount(item.likes)}`
                      ].filter((line) => line !== '')
                    };
                  })}
                  reference={
                    usual > 0 ? { value: usual, label: `${copy.performance.median} ${formatCount(usual)}` } : undefined
                  }
                  maxLabel={formatCount(Math.max(...own.map((item) => item.views ?? 0)))}
                  startLabel={first ? formatPublished(first.publishedAt, timezone) : undefined}
                  endLabel={last ? formatPublished(last.publishedAt, timezone) : undefined}
                  height={180}
                  onSelect={onOpen}
                />
              </section>
            );
          })
        )}
      </div>
    </Panel>
  );
}
