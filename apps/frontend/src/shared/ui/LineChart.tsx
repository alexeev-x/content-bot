import { useEffect, useRef, useState, type PointerEvent } from 'react';
import styles from './LineChart.module.css';

export type LineSeries = {
  id: string;
  label: string;
  points: readonly { x: number; y: number }[];
  /** A CSS colour, normally a token: `var(--color-accent)`. */
  color: string;
  /** Dashed and without area: a reference such as the usual curve. */
  dashed?: boolean;
  /** Fills the area under the line (the main series only). */
  area?: boolean;
};

/** A shaded range behind the lines, e.g. the usual p25–p75 of comparable items. */
export type LineBand = {
  label: string;
  points: readonly { x: number; low: number; high: number }[];
  /** A CSS colour, normally the colour of the line it surrounds. */
  color: string;
};

type Props = {
  series: readonly LineSeries[];
  band?: LineBand | undefined;
  /** Summary for assistive technology; the values themselves are in the page's tables. */
  label: string;
  formatX: (x: number) => string;
  formatY: (y: number) => string;
  /** Positions on the x axis to label; defaults to five even steps. */
  xTicks?: readonly number[];
  height?: number;
  /** Shows the last value of each series at the right edge. */
  endLabels?: boolean;
};

const PAD = { top: 12, right: 72, bottom: 24, left: 44 };

function niceMax(value: number): number {
  if (value <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((candidate) => candidate * power >= value / 4) ?? 10;
  return Math.ceil(value / (step * power)) * step * power;
}

function valueAt(points: readonly { x: number; y: number }[], x: number): number | null {
  if (points.length === 0) return null;
  const first = points[0]!;
  const last = points.at(-1)!;
  if (x < first.x || x > last.x) return null;
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1]!;
    const b = points[index]!;
    if (x <= b.x) return b.x === a.x ? b.y : a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x);
  }
  return last.y;
}

/**
 * Lines over time with axes, a recessive grid, a crosshair tooltip that lists every series at the pointer,
 * and end labels. The width follows the container (measured), so text stays crisp at every size.
 */
export function LineChart({ series, band, label, formatX, formatY, xTicks, height = 220, endLabels = true }: Props) {
  const ref = useRef<HTMLElement>(null);
  const [width, setWidth] = useState(600);
  const [hoverX, setHoverX] = useState<number | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.max(240, Math.round(entry.contentRect.width)));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const bandPoints = band?.points ?? [];
  const all = [
    ...series.flatMap((entry) => entry.points),
    ...bandPoints.map((point) => ({ x: point.x, y: point.high }))
  ];
  const minX = all.length > 0 ? Math.min(...all.map((point) => point.x)) : 0;
  const maxX = all.length > 0 ? Math.max(...all.map((point) => point.x)) : 1;
  const maxY = niceMax(Math.max(0, ...all.map((point) => point.y)));
  const right = endLabels ? PAD.right : 12;
  const plotWidth = width - PAD.left - right;
  const plotHeight = height - PAD.top - PAD.bottom;
  const sx = (x: number) => PAD.left + ((x - minX) / (maxX - minX || 1)) * plotWidth;
  const sy = (y: number) => PAD.top + (1 - y / maxY) * plotHeight;
  const ticksX = xTicks ?? [0, 1, 2, 3, 4].map((step) => minX + ((maxX - minX) * step) / 4);
  const ticksY = [0, 0.25, 0.5, 0.75, 1].map((step) => maxY * step);

  const onMove = (event: PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const x = minX + ((event.clientX - box.left - PAD.left) / plotWidth) * (maxX - minX);
    setHoverX(Math.min(maxX, Math.max(minX, x)));
  };
  const readout =
    hoverX === null
      ? []
      : series
          .map((entry) => ({ entry, value: valueAt(entry.points, hoverX) }))
          .filter((row): row is { entry: LineSeries; value: number } => row.value !== null);
  const bandLow =
    hoverX === null
      ? null
      : valueAt(
          bandPoints.map((point) => ({ x: point.x, y: point.low })),
          hoverX
        );
  const bandHigh =
    hoverX === null
      ? null
      : valueAt(
          bandPoints.map((point) => ({ x: point.x, y: point.high })),
          hoverX
        );

  return (
    <figure ref={ref} className={styles.root} aria-label={label}>
      <svg
        width={width}
        height={height}
        aria-hidden="true"
        onPointerMove={onMove}
        onPointerLeave={() => setHoverX(null)}
      >
        {ticksY.map((tick) => (
          <g key={tick}>
            <line className={styles.grid} x1={PAD.left} x2={PAD.left + plotWidth} y1={sy(tick)} y2={sy(tick)} />
            <text className={styles.tick} x={PAD.left - 8} y={sy(tick)} textAnchor="end" dominantBaseline="middle">
              {formatY(tick)}
            </text>
          </g>
        ))}
        {ticksX.map((tick) => (
          <text key={tick} className={styles.tick} x={sx(tick)} y={height - 6} textAnchor="middle">
            {formatX(tick)}
          </text>
        ))}
        {band && bandPoints.length >= 2 ? (
          <path
            className={styles.band}
            fill={band.color}
            d={`${bandPoints.map((point, index) => `${index === 0 ? 'M' : 'L'}${sx(point.x)},${sy(point.high)}`).join(' ')} ${[
              ...bandPoints
            ]
              .reverse()
              .map((point) => `L${sx(point.x)},${sy(point.low)}`)
              .join(' ')} Z`}
          />
        ) : null}
        {series.map((entry) => {
          if (entry.points.length < 2) return null;
          const path = entry.points
            .map((point, index) => `${index === 0 ? 'M' : 'L'}${sx(point.x)},${sy(point.y)}`)
            .join(' ');
          const last = entry.points.at(-1)!;
          return (
            <g key={entry.id}>
              {entry.area ? (
                <path
                  d={`${path} L${sx(last.x)},${sy(0)} L${sx(entry.points[0]!.x)},${sy(0)} Z`}
                  fill={entry.color}
                  className={styles.area}
                />
              ) : null}
              <path d={path} fill="none" stroke={entry.color} className={entry.dashed ? styles.dashed : styles.line} />
              <circle cx={sx(last.x)} cy={sy(last.y)} r={4} fill={entry.color} className={styles.dot} />
              {endLabels ? (
                <text className={styles.endLabel} x={sx(last.x) + 8} y={sy(last.y)} dominantBaseline="middle">
                  {formatY(last.y)}
                </text>
              ) : null}
            </g>
          );
        })}
        {hoverX !== null ? (
          <line className={styles.crosshair} x1={sx(hoverX)} x2={sx(hoverX)} y1={PAD.top} y2={PAD.top + plotHeight} />
        ) : null}
      </svg>
      {hoverX !== null && readout.length > 0 ? (
        <div
          className={styles.tooltip}
          aria-hidden="true"
          style={{
            left: Math.min(sx(hoverX) + 12, width - 180),
            top: PAD.top
          }}
        >
          <span className={styles.tooltipTitle}>{formatX(hoverX)}</span>
          {readout.map(({ entry, value }) => (
            <span key={entry.id} className={styles.tooltipRow}>
              <span
                className={styles.key}
                style={{ borderColor: entry.color }}
                data-dashed={entry.dashed || undefined}
              />
              <strong>{formatY(value)}</strong>
              <span>{entry.label}</span>
            </span>
          ))}
          {band && bandLow !== null && bandHigh !== null ? (
            <span className={styles.tooltipRow}>
              <span className={styles.bandKey} style={{ background: band.color }} />
              <strong>
                {formatY(bandLow)}–{formatY(bandHigh)}
              </strong>
              <span>{band.label}</span>
            </span>
          ) : null}
        </div>
      ) : null}
      <ul className={styles.legend}>
        {series.map((entry) => (
          <li key={entry.id}>
            <span className={styles.key} style={{ borderColor: entry.color }} data-dashed={entry.dashed || undefined} />
            {entry.label}
          </li>
        ))}
        {band && bandPoints.length >= 2 ? (
          <li>
            <span className={styles.bandKey} style={{ background: band.color }} />
            {band.label}
          </li>
        ) : null}
      </ul>
    </figure>
  );
}
