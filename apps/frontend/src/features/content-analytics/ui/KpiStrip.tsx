import { AreaChart, Icon, Skeleton } from '../../../shared/ui';
import { formatCount } from '../model/format';
import styles from './Report.module.css';

export type Kpi = {
  id: string;
  label: string;
  value: string;
  /** Percent against the previous period; null when there is nothing to compare with. */
  change: number | null;
  /** Absolute change shown instead of a percent (followers). */
  absolute?: number | null;
  /** Shown when there is no comparison. */
  hint: string;
  series?: readonly number[];
  /** Hover text per point of the series. */
  tips?: readonly string[];
};

type Props = { kpis: readonly Kpi[] | undefined; days: number };

/** Headline numbers with their change against the previous period of the same length (YouTube Studio style). */
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
            <span className={styles.kpiLabel}>{kpi.label}</span>
            <span className={styles.kpiValue}>{kpi.value}</span>
            <span className={styles.kpiChange} data-tone={tone}>
              {tone === 'up' ? (
                <Icon name="arrow-up" size={14} />
              ) : tone === 'down' ? (
                <Icon name="arrow-down" size={14} />
              ) : null}
              {kpi.absolute !== undefined && kpi.absolute !== null
                ? `${kpi.absolute > 0 ? '+' : kpi.absolute < 0 ? '−' : ''}${formatCount(Math.abs(kpi.absolute))} за ${days} дн.`
                : kpi.change !== null
                  ? `${kpi.change > 0 ? '+' : kpi.change < 0 ? '−' : ''}${Math.abs(kpi.change)}% к прошлым ${days} дн.`
                  : kpi.hint}
            </span>
            {kpi.series && kpi.series.length > 1 ? (
              <span className={styles.kpiChart}>
                <AreaChart points={kpi.series} height={32} {...(kpi.tips ? { tips: kpi.tips } : {})} />
              </span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
