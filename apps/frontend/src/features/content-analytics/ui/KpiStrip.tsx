import { AreaChart, Icon, type IconName, Skeleton } from '../../../shared/ui';
import { formatCount } from '../model/format';
import styles from './Kpi.module.css';

export type Kpi = {
  id: string;
  label: string;
  value: string;
  icon: IconName;
  /** Percent against the previous period; null when there is nothing to compare with. */
  change: number | null;
  /** Absolute change shown instead of a percent (followers). */
  absolute?: number | null;
  /** Shown when there is no comparison. */
  hint: string;
  series?: readonly number[];
  /** Hover text per point of the series. */
  tips?: readonly string[];
  chart?: 'area' | 'bars';
  /** Colour of the card's chart; the accent by default. */
  color?: string;
};

type Props = { kpis: readonly Kpi[] | undefined; days: number };

/** Headline numbers, each with its change against the previous period and its own small chart. */
export function KpiStrip({ kpis, days }: Props) {
  if (kpis === undefined) {
    return (
      <ul className={styles.kpis} aria-hidden="true">
        {[0, 1, 2, 3, 4].map((key) => (
          <li key={key} className={styles.kpi}>
            <Skeleton width="50%" height={12} />
            <Skeleton width="70%" height={28} />
            <Skeleton width="60%" height={12} />
          </li>
        ))}
      </ul>
    );
  }
  return (
    <ul className={styles.kpis}>
      {kpis.map((kpi) => {
        const delta = kpi.absolute ?? kpi.change;
        const tone = delta === null || delta === undefined || delta === 0 ? 'flat' : delta > 0 ? 'up' : 'down';
        return (
          <li key={kpi.id} className={styles.kpi}>
            <span className={styles.head}>
              <span className={styles.label}>{kpi.label}</span>
              <span className={styles.icon}>
                <Icon name={kpi.icon} size={16} />
              </span>
            </span>
            <span className={styles.value}>{kpi.value}</span>
            <span className={styles.change} data-tone={tone}>
              {tone === 'up' ? '↑ ' : tone === 'down' ? '↓ ' : ''}
              {kpi.absolute !== undefined && kpi.absolute !== null
                ? `${kpi.absolute > 0 ? '+' : kpi.absolute < 0 ? '−' : ''}${formatCount(Math.abs(kpi.absolute))} за ${days} дн.`
                : kpi.change !== null
                  ? `${kpi.change > 0 ? '+' : kpi.change < 0 ? '−' : ''}${Math.abs(kpi.change)}% к прошлым ${days} дн.`
                  : kpi.hint}
            </span>
            {kpi.series && kpi.series.length > 1 ? (
              <span className={styles.chart}>
                <AreaChart
                  points={kpi.series}
                  height={40}
                  variant={kpi.chart ?? 'area'}
                  {...(kpi.color ? { color: kpi.color } : {})}
                  {...(kpi.tips ? { tips: kpi.tips } : {})}
                />
              </span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
