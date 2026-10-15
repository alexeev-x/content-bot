import type { ContentItemDto } from '@alexeev/contracts';
import type { CSSProperties } from 'react';
import { DonutChart, Panel } from '../../../shared/ui';
import { formatCount, PLATFORM_LABEL } from '../model/format';
import { PLATFORMS } from '../model/report';
import styles from './Widgets.module.css';

const COLOR = {
  telegram: 'var(--color-platform-telegram)',
  youtube: 'var(--color-platform-youtube)',
  tiktok: 'var(--color-platform-tiktok)'
} as const;

/** Which platform the period's views came from. */
export function DistributionPanel({ items }: { items: readonly ContentItemDto[] | undefined }) {
  const rows = PLATFORMS.map((platform) => ({
    platform,
    views: (items ?? []).filter((item) => item.platform === platform).reduce((sum, item) => sum + (item.views ?? 0), 0)
  }));
  const total = rows.reduce((sum, row) => sum + row.views, 0);
  return (
    <Panel title="Распределение по платформам" headingLevel={2} quiet>
      <div className={`${styles.body} ${styles.distribution}`}>
        <DonutChart
          slices={rows.map((row) => ({
            id: row.platform,
            label: `${PLATFORM_LABEL[row.platform]}, ${formatCount(row.views)}`,
            value: row.views,
            color: COLOR[row.platform],
            caption: `${total > 0 ? Math.round((row.views / total) * 100) : 0}%`
          }))}
          centerValue={formatCount(total)}
          centerLabel="просмотров"
          label="Доли просмотров по платформам"
        />
        <ul className={styles.shares}>
          {rows.map((row) => (
            <li key={row.platform} className={styles.share}>
              <span className={styles.dot} style={{ '--swatch': COLOR[row.platform] } as CSSProperties} />
              <span>{PLATFORM_LABEL[row.platform]}</span>
              <strong>{total > 0 ? Math.round((row.views / total) * 100) : 0}%</strong>
              <span className={styles.small}>{formatCount(row.views)}</span>
            </li>
          ))}
        </ul>
      </div>
    </Panel>
  );
}
