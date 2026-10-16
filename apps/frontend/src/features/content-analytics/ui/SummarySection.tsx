import { formatDay } from '../model/format';
import { type Kpi, KpiStrip } from './KpiStrip';
import styles from './Report.module.css';

type Props = {
  days: number;
  /** The report's first and last day (ISO), once it is loaded. */
  range?: { from: string; to: string };
  kpis: readonly Kpi[] | undefined;
};

/** «Сводка за N дней»: the headline numbers. One section for the loaded board and its skeleton. */
export function SummarySection({ days, range, kpis }: Props) {
  return (
    <section className={styles.summary} aria-labelledby="summary-title">
      <h2 id="summary-title" className={styles.summaryTitle}>
        Сводка за {days} дней
        {range ? (
          <span>
            {formatDay(range.from.slice(0, 10))} — {formatDay(range.to.slice(0, 10))}
          </span>
        ) : null}
      </h2>
      <KpiStrip kpis={kpis} days={days} />
    </section>
  );
}
