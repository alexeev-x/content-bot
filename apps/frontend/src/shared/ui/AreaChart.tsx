import { type CSSProperties, type PointerEvent, useState } from 'react';
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
  /**
   * One line per point («15 окт.: 1 240 просмотров»): hovering the chart shows the nearest point's line
   * with a marker. The values must also be readable elsewhere on the page (a number, a table).
   */
  tips?: readonly string[];
  /** `bars`: one bar per point (counts per day); `area` (default): a filled line. */
  variant?: 'area' | 'bars';
  /** Series colour; the accent by default. */
  color?: string;
};

const VIEW_W = 100;

/**
 * Responsive area chart in the accent: fills its container's width (Cloudflare-style metric tiles and
 * the growth curve). The stroke keeps its width when the SVG stretches.
 */
export function AreaChart({ points, x, label, baseline = 'data', height = 48, tips, variant = 'area', color }: Props) {
  const [active, setActive] = useState<number | null>(null);
  const has = points.length >= 2;
  const min = has ? (baseline === 'zero' ? Math.min(0, ...points) : Math.min(...points)) : 0;
  const span = has ? Math.max(...points) - min || 1 : 1;
  const step = has ? VIEW_W / (points.length - 1) : VIEW_W;
  const barStep = VIEW_W / Math.max(1, points.length);
  const timed = has && x !== undefined && x.length === points.length;
  const x0 = timed ? x[0]! : 0;
  const xSpan = timed ? x.at(-1)! - x0 || 1 : 1;
  const xAt = (index: number) =>
    variant === 'bars' ? (index + 0.5) * barStep : timed ? ((x[index]! - x0) / xSpan) * VIEW_W : index * step;
  const pad = 2;
  const y = (value: number) => pad + (1 - (value - min) / span) * (height - 2 * pad);
  const coords = has ? points.map((value, index) => `${xAt(index).toFixed(2)},${y(value).toFixed(2)}`) : [];
  const line = coords.join(' ');
  const area = has ? `M0,${height} L${coords.join(' L')} L${VIEW_W},${height}Z` : '';
  const interactive = has && tips !== undefined && tips.length === points.length;

  const onMove = (event: PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const at = ((event.clientX - box.left) / box.width) * VIEW_W;
    let nearest = 0;
    for (let index = 1; index < points.length; index += 1) {
      if (Math.abs(xAt(index) - at) < Math.abs(xAt(nearest) - at)) nearest = index;
    }
    setActive(nearest);
  };
  const left = active === null ? 0 : xAt(active);

  return (
    <div className={styles.root} style={color ? ({ '--chart-color': color } as CSSProperties) : undefined}>
      <svg
        className={styles.chart}
        viewBox={`0 0 ${VIEW_W} ${height}`}
        preserveAspectRatio="none"
        height={height}
        role={label ? 'img' : undefined}
        aria-label={label}
        aria-hidden={label ? undefined : true}
        focusable="false"
        onPointerMove={interactive ? onMove : undefined}
        onPointerLeave={interactive ? () => setActive(null) : undefined}
      >
        {has && variant === 'bars' ? (
          points.map((value, index) => {
            const width = (VIEW_W / points.length) * 0.62;
            // Bars stand on zero: scaled over 0..max, so no bar rises above the chart (with a data baseline
            // above zero, the old span made tall bars overflow onto the text above).
            const floor = Math.min(0, min);
            const top = pad + (1 - (value - floor) / (Math.max(...points) - floor || 1)) * (height - 2 * pad);
            return (
              <rect
                key={index}
                className={styles.barRect}
                data-active={index === active || undefined}
                x={xAt(index) - width / 2}
                y={top}
                width={width}
                height={Math.max(1, height - top)}
                rx={0.6}
              />
            );
          })
        ) : has ? (
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
        {interactive && active !== null ? (
          <line className={styles.cursor} x1={left} x2={left} y1={0} y2={height} vectorEffect="non-scaling-stroke" />
        ) : null}
      </svg>
      {interactive && active !== null ? (
        <>
          <span
            className={styles.marker}
            style={{ left: `${left}%`, top: `${y(points[active]!)}px` }}
            aria-hidden="true"
          />
          <span
            className={styles.tooltip}
            data-side={left > 60 ? 'left' : 'right'}
            style={{ left: `${left}%` }}
            aria-hidden="true"
          >
            {tips[active]}
          </span>
        </>
      ) : null}
    </div>
  );
}
