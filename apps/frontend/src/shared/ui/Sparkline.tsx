type Props = {
  points: readonly number[];
  /** Describes the trend for assistive technology; without it the chart is decorative. */
  label?: string;
  tone?: 'accent' | 'warn' | 'bad';
  width?: number;
  height?: number;
};

const PAD = 3;

/** Inline SVG trend line. The stroke follows the accent unless a status tone is requested. */
export function Sparkline({ points, label, tone = 'accent', width = 72, height = 32 }: Props) {
  if (points.length < 2) return null;
  const min = Math.min(...points);
  const span = Math.max(...points) - min || 1;
  const step = (width - 2 * PAD) / (points.length - 1);
  const coords = points.map(
    (value, index) => [PAD + index * step, PAD + (1 - (value - min) / span) * (height - 2 * PAD)] as const
  );
  const line = coords.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `M${coords[0]![0].toFixed(1)},${height} L${line.replaceAll(' ', ' L')} L${coords.at(-1)![0].toFixed(1)},${height}Z`;
  const stroke =
    tone === 'warn'
      ? 'var(--color-status-unknown-fg)'
      : tone === 'bad'
        ? 'var(--color-status-failed-fg)'
        : 'var(--color-accent-text)';
  const fill =
    tone === 'warn'
      ? 'var(--color-status-unknown-bg)'
      : tone === 'bad'
        ? 'var(--color-status-failed-bg)'
        : 'var(--color-accent-soft)';
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
      style={{ flex: 'none' }}
    >
      <path d={area} fill={fill} />
      <polyline
        points={line}
        fill="none"
        stroke={stroke}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
