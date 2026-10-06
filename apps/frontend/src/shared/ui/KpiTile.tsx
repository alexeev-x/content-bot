import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import styles from './KpiTile.module.css';
import { Sparkline } from './Sparkline';

type Props = {
  label: string;
  /** The headline number, already formatted. */
  value: ReactNode;
  /** Small suffix after the value, e.g. «/ 3 в порядке». */
  unit?: string;
  icon?: IconName;
  hint?: string;
  trend?: readonly number[];
  trendLabel?: string;
  tone?: 'accent' | 'warn' | 'bad';
};

export function KpiTile({ label, value, unit, icon, hint, trend, trendLabel, tone = 'accent' }: Props) {
  return (
    <div className={styles.tile}>
      <span className={styles.label}>
        {icon ? <Icon name={icon} size={16} /> : null}
        {label}
      </span>
      <span className={styles.value}>
        {value}
        {unit ? <span className={styles.unit}>{unit}</span> : null}
      </span>
      <div className={styles.footer}>
        {hint ? <span className={styles.hint}>{hint}</span> : <span />}
        {trend ? <Sparkline points={trend} label={trendLabel} tone={tone} /> : null}
      </div>
    </div>
  );
}
