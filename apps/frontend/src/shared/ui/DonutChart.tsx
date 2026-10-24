import { useState } from 'react';
import styles from './DonutChart.module.css';

export type DonutSlice = {
  id: string;
  label: string;
  value: number;
  color: string;
  /** Shown in the middle while the slice is hovered, e.g. «52%». */
  caption?: string;
};

type Props = {
  slices: readonly DonutSlice[];
  /** The number in the middle and its caption. */
  centerValue: string;
  centerLabel: string;
  label: string;
  size?: number;
};

const STROKE = 14;

/** Shares of one whole; a 2 px gap separates slices. The caller lists the same values in a legend. */
export function DonutChart({ slices, centerValue, centerLabel, label, size = 148 }: Props) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const radius = (size - STROKE) / 2;
  const circumference = 2 * Math.PI * radius;
  const [hovered, setHovered] = useState<string | null>(null);
  const active = slices.find((slice) => slice.id === hovered);
  let offset = 0;
  return (
    <figure className={styles.root} style={{ width: size, height: size }} aria-label={label}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden="true"
        onPointerLeave={() => setHovered(null)}
      >
        <circle className={styles.track} cx={size / 2} cy={size / 2} r={radius} strokeWidth={STROKE} fill="none" />
        {total > 0
          ? slices.map((slice) => {
              const length = (slice.value / total) * circumference;
              const gap = slices.length > 1 ? Math.min(2, length / 2) : 0;
              const dash = `${Math.max(0, length - gap)} ${circumference}`;
              const element = (
                <circle
                  key={slice.id}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  stroke={slice.color}
                  strokeWidth={STROKE}
                  strokeDasharray={dash}
                  strokeDashoffset={-offset}
                  transform={`rotate(-90 ${size / 2} ${size / 2})`}
                  className={styles.slice}
                  data-dimmed={hovered !== null && hovered !== slice.id ? '' : undefined}
                  onPointerEnter={() => setHovered(slice.id)}
                />
              );
              offset += length;
              return element;
            })
          : null}
      </svg>
      <figcaption className={styles.center}>
        <strong>{active ? (active.caption ?? active.value.toLocaleString('ru-RU')) : centerValue}</strong>
        <span>{active ? active.label : centerLabel}</span>
      </figcaption>
    </figure>
  );
}
