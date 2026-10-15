import styles from './AreaChart.module.css';

type Props = {
  /** Values in time order; fewer than two draws the empty baseline. */
  points: readonly number[];
  /** Describes the trend for assistive technology; without it the chart is decorative. */
  label?: string;
  /** Positions on the time axis (same length as `points`) for unevenly spaced samples; evenly spaced without it. */
  x?: readonly number[];
  /** `zero` starts the value axis at 0 (absolute growth); `data` fits the range (a trend). Default `data`. */
  baseline?: 'zero' | 'data';
  /** Height in px; the width follows the container. */
  height?: number;
};

const VIEW_W = 100;

/**
 * Responsive area chart in the accent: fills its container's width (Cloudflare-style metric tiles and
 * the growth curve). The stroke keeps its width when the SVG stretches.
 */
export function AreaChart({ points, x, label, baseline = 'data', height = 48 }: Props) {
  const has = points.length >= 2;
  const min = has ? (baseline === 'zero' ? Math.min(0, ...points) : Math.min(...points)) : 0;
  const span = has ? Math.max(...points) - min || 1 : 1;
  const step = has ? VIEW_W / (points.length - 1) : VIEW_W;
  const timed = has && x !== undefined && x.length === points.length;
  const x0 = timed ? x[0]! : 0;
  const xSpan = timed ? x.at(-1)! - x0 || 1 : 1;
  const xAt = (index: number) => (timed ? ((x[index]! - x0) / xSpan) * VIEW_W : index * step);
  const pad = 2;
  const y = (value: number) => pad + (1 - (value - min) / span) * (height - 2 * pad);
  const coords = has ? points.map((value, index) => `${xAt(index).toFixed(2)},${y(value).toFixed(2)}`) : [];
  const line = coords.join(' ');
  const area = has ? `M0,${height} L${coords.join(' L')} L${VIEW_W},${height}Z` : '';
  return (
    <svg
      className={styles.chart}
      viewBox={`0 0 ${VIEW_W} ${height}`}
      preserveAspectRatio="none"
      height={height}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      {has ? (
        <>
          <path className={styles.area} d={area} />
          <polyline className={styles.line} points={line} vectorEffect="non-scaling-stroke" />
        </>
      ) : (
        <line
          className={styles.empty}
          x1="0"
          x2={VIEW_W}
          y1={height - 1}
          y2={height - 1}
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  );
}
