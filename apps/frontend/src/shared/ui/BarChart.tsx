import { useRef, useState, type KeyboardEvent } from 'react';
import styles from './BarChart.module.css';

export type ChartBar = {
  id: string;
  value: number;
  /** First tooltip line, e.g. the post title. */
  title: string;
  /** Further tooltip lines: date, value, comparison. */
  lines: readonly string[];
  /** Strong bars stand out (accent); the rest stay soft. The legend explains what strong means. */
  strong?: boolean;
  /** Three-step emphasis instead of `strong`: above the norm, within it, below it. */
  tone?: 'strong' | 'normal' | 'weak';
  /** A muted bar beside this one for the same slot of a previous period. */
  compare?: number;
  /** Value written above the bar («162,7 тыс.»). */
  topLabel?: string;
  /** Short text inside the bar's foot («24,7×»). */
  insideLabel?: string;
  /** Text under the slot («17 сент.»); with any of these the start/end labels are not drawn. */
  bottomLabel?: string;
  /** A small cover above the bar (videos). */
  image?: string | null;
};

type Props = {
  bars: readonly ChartBar[];
  /** Names the chart and summarizes it for assistive technology. */
  label: string;
  /** A dashed horizontal line with its label, e.g. the median. */
  reference?: { value: number; label: string } | undefined;
  /** Axis text under the first and the last bar. */
  startLabel?: string;
  endLabel?: string;
  /** Text of the top of the value axis. */
  maxLabel?: string;
  height?: number;
  /** Click or Enter on a bar. */
  onSelect?: (id: string) => void;
};

/**
 * Vertical bars with a tooltip on hover and on keyboard focus: each bar is a button (one Tab stop, arrows
 * move between bars, Enter opens it) whose name carries the tooltip text. Values never depend on the
 * tooltip alone: the caller shows the same rows in a table.
 */
export function BarChart({ bars, label, reference, startLabel, endLabel, maxLabel, height = 200, onSelect }: Props) {
  const [active, setActive] = useState<number | null>(null);
  // Roving focus: one bar is the Tab stop, arrows move between bars.
  const [focusIndex, setFocusIndex] = useState(0);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const max = Math.max(1, reference?.value ?? 0, ...bars.map((bar) => Math.max(bar.value, bar.compare ?? 0)));
  const current = active === null ? undefined : bars[active];
  const labelled = bars.some((bar) => bar.bottomLabel !== undefined);
  const withImages = bars.some((bar) => bar.image !== undefined);
  // Room above the tallest bar for its value label and cover.
  const headroom = (bars.some((bar) => bar.topLabel) ? 18 : 0) + (withImages ? 44 : 0);
  const plotHeight = height - headroom - (bars.some((bar) => bar.insideLabel) ? 20 : 0);
  const barHeight = (bar: ChartBar) => Math.max(2, (bar.value / max) * plotHeight);

  const move = (index: number) => {
    setFocusIndex(index);
    setActive(index);
    refs.current[index]?.focus();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = bars.length - 1;
    const next =
      event.key === 'ArrowRight'
        ? Math.min(last, index + 1)
        : event.key === 'ArrowLeft'
          ? Math.max(0, index - 1)
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null;
    if (next !== null) {
      event.preventDefault();
      move(next);
    } else if (event.key === 'Escape') {
      setActive(null);
    }
  };

  return (
    <figure className={styles.root} aria-label={label}>
      <div className={styles.plot} style={{ height }}>
        {maxLabel ? <span className={styles.max}>{maxLabel}</span> : null}
        {reference ? (
          <div
            className={styles.reference}
            style={{ bottom: `${(reference.value / max) * plotHeight}px` }}
            aria-hidden="true"
          >
            <span>{reference.label}</span>
          </div>
        ) : null}
        <div className={styles.bars} onPointerLeave={() => setActive(null)}>
          {bars.map((bar, index) => {
            const tone = bar.tone ?? (bar.strong ? 'strong' : 'normal');
            return (
              <button
                key={bar.id}
                ref={(element) => {
                  refs.current[index] = element;
                }}
                type="button"
                className={styles.slot}
                data-active={index === active || undefined}
                tabIndex={index === Math.min(focusIndex, bars.length - 1) ? 0 : -1}
                aria-label={[bar.title, ...bar.lines].join(', ')}
                onPointerEnter={() => setActive(index)}
                onFocus={() => setActive(index)}
                onBlur={() => setActive(null)}
                onKeyDown={(event) => onKeyDown(event, index)}
                onClick={onSelect ? () => onSelect(bar.id) : undefined}
              >
                <span className={styles.column}>
                  {bar.image ? (
                    <img className={styles.image} src={bar.image} alt="" loading="lazy" referrerPolicy="no-referrer" />
                  ) : null}
                  {bar.topLabel ? <span className={styles.topLabel}>{bar.topLabel}</span> : null}
                  {/* A bar too short to hold its label carries it above instead. */}
                  {bar.insideLabel && barHeight(bar) < 22 ? (
                    <span className={styles.insideLabel}>{bar.insideLabel}</span>
                  ) : null}
                  <span className={styles.pair}>
                    <span className={styles.bar} data-tone={tone} style={{ height: `${barHeight(bar)}px` }}>
                      {bar.insideLabel && barHeight(bar) >= 22 ? (
                        <span className={styles.insideLabel}>{bar.insideLabel}</span>
                      ) : null}
                    </span>
                    {bar.compare !== undefined ? (
                      <span
                        className={styles.compare}
                        style={{ height: `${Math.max(2, (bar.compare / max) * plotHeight)}px` }}
                      />
                    ) : null}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        {current ? (
          <div
            className={styles.tooltip}
            aria-hidden="true"
            data-side={active !== null && active > bars.length / 2 ? 'left' : 'right'}
            style={{ left: `${((active! + 0.5) / bars.length) * 100}%` }}
          >
            <strong>{current.title}</strong>
            {current.lines.map((line) => (
              <span key={line}>{line}</span>
            ))}
          </div>
        ) : null}
      </div>
      {labelled ? (
        <figcaption className={styles.slotLabels} aria-hidden="true">
          {bars.map((bar) => (
            <span key={bar.id}>{bar.bottomLabel ?? ''}</span>
          ))}
        </figcaption>
      ) : startLabel || endLabel ? (
        <figcaption className={styles.axis} aria-hidden="true">
          <span>{startLabel}</span>
          <span>{endLabel}</span>
        </figcaption>
      ) : null}
    </figure>
  );
}
