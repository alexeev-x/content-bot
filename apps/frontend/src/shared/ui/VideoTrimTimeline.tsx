import type { KeyboardEvent } from 'react';
import { Slider as AriaSlider, SliderThumb, SliderTrack } from 'react-aria-components';
import { MIN_CLIP_SECONDS, TRIM_STEP, clampTrimRange, formatClock, nudgeTrim, type TrimRange } from '../lib/video-trim';
import { Button } from './Button';
import styles from './VideoTrimTimeline.module.css';

type Props = {
  duration: number;
  range: TrimRange;
  onChange: (range: TrimRange) => void;
  /** Filmstrip thumbnails; `null` while they are still being cut. */
  frames: string[] | null;
  /** Current time of the range preview, or `null` when it is not playing. */
  playhead: number | null;
  previewing: boolean;
  onTogglePreview: () => void;
  isDisabled?: boolean;
};

const BIG_STEP_SECONDS = TRIM_STEP * 10;
const HANDLES = ['start', 'end'] as const;

/** Filmstrip with two draggable handles (React Aria two-thumb slider), a playhead and start / end / length labels. */
export function VideoTrimTimeline({
  duration,
  range,
  onChange,
  frames,
  playhead,
  previewing,
  onTogglePreview,
  isDisabled
}: Props) {
  const percent = (seconds: number) => (duration > 0 ? (seconds / duration) * 100 : 0);

  // Shift+arrow jumps a second; plain arrows keep the slider's own 0.1 s step.
  const onKeyDownCapture = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!event.shiftKey || isDisabled) return;
    const direction =
      event.key === 'ArrowRight' || event.key === 'ArrowUp'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowDown'
          ? -1
          : 0;
    if (direction === 0) return;
    const handle = (event.target as HTMLElement).closest<HTMLElement>('[data-handle]')?.dataset.handle;
    if (handle !== 'start' && handle !== 'end') return;
    event.preventDefault();
    event.stopPropagation();
    onChange(nudgeTrim(range, duration, handle, direction * BIG_STEP_SECONDS));
  };

  return (
    <div className={styles.timeline}>
      <dl className={styles.readout}>
        <div>
          <dt>Начало</dt>
          <dd>{formatClock(range.start)}</dd>
        </div>
        <div>
          <dt>Длительность</dt>
          <dd>{formatClock(Math.max(0, range.end - range.start))}</dd>
        </div>
        <div>
          <dt>Конец</dt>
          <dd>{formatClock(range.end)}</dd>
        </div>
      </dl>
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions -- captures keys bubbling from the focused handles */}
      <div onKeyDownCapture={onKeyDownCapture}>
        <AriaSlider
          aria-label="Отрезок видео"
          minValue={0}
          maxValue={duration}
          step={TRIM_STEP}
          value={[range.start, range.end]}
          onChange={(values) => {
            const [nextStart = range.start, nextEnd = range.end] = values;
            onChange(
              clampTrimRange({ start: nextStart, end: nextEnd }, duration, nextStart !== range.start ? 'start' : 'end')
            );
          }}
          isDisabled={isDisabled}
          className={styles.slider}
          formatOptions={{ minimumFractionDigits: 1, maximumFractionDigits: 1 }}
        >
          <SliderTrack className={styles.track}>
            {({ state }) => (
              <>
                <div className={styles.strip} data-loading={frames === null ? '' : undefined}>
                  {frames?.map((frame, index) => (
                    <img key={index} src={frame} alt="" draggable={false} />
                  ))}
                </div>
                <div className={styles.dim} style={{ left: 0, width: `${state.getThumbPercent(0) * 100}%` }} />
                <div className={styles.dim} style={{ left: `${state.getThumbPercent(1) * 100}%`, right: 0 }} />
                <div
                  className={styles.range}
                  style={{
                    left: `${state.getThumbPercent(0) * 100}%`,
                    width: `${(state.getThumbPercent(1) - state.getThumbPercent(0)) * 100}%`
                  }}
                />
                {playhead !== null ? (
                  <div
                    className={styles.playhead}
                    style={{ left: `${percent(Math.min(Math.max(playhead, 0), duration))}%` }}
                    aria-hidden="true"
                  />
                ) : null}
                {HANDLES.map((handle, index) => (
                  <SliderThumb
                    key={handle}
                    index={index}
                    data-handle={handle}
                    aria-label={handle === 'start' ? 'Начало отрезка' : 'Конец отрезка'}
                    className={styles.thumb}
                  />
                ))}
              </>
            )}
          </SliderTrack>
        </AriaSlider>
      </div>
      <div className={styles.actions}>
        <Button
          variant="secondary"
          icon={previewing ? 'pause' : 'play'}
          isDisabled={isDisabled}
          onPress={onTogglePreview}
        >
          {previewing ? 'Остановить' : 'Проверить отрезок'}
        </Button>
        <span className={styles.hint}>
          Стрелки двигают на 0,1 с, Shift + стрелки на 1 с. Минимум {MIN_CLIP_SECONDS} с.
        </span>
      </div>
    </div>
  );
}
