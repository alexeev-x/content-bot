import { useRef, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import {
  cornerPoint,
  moveFrame,
  resizeFromCorner,
  type CropCorner,
  type CropFrame,
  type StageSize
} from './crop-frame';
import styles from './CropCanvas.module.css';

export type { CropCorner, CropFrame } from './crop-frame';
export { fitFrame } from './crop-frame';

const CORNERS: readonly CropCorner[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];

export type CropCanvasLabels = {
  /** The focusable region: arrows move the frame («Область кадрирования»). */
  region: string;
  /** The four corner handles: arrows resize («Левый верхний угол» …). */
  corners: Readonly<Record<CropCorner, string>>;
};

type Props = {
  src: string;
  /** Width / height of the image as shown (already swapped for a quarter-turn rotation). The stage takes this shape. */
  imageAspect: number;
  /** The frame in stage fractions (0–1): the part of the image that is kept. */
  frame: CropFrame;
  onFrameChange: (frame: CropFrame) => void;
  /** Width / height of the frame in stage pixels; the corners then resize without changing the shape. Omit for a free frame. */
  lockedRatio?: number | undefined;
  /** 1 = the image fits the stage; larger scales it about the stage centre (the stage clips the overflow). */
  zoom?: number;
  /** Quarter turns, 0 | 90 | 180 | 270 (clockwise). */
  rotation?: number;
  /** `square`: filled square corners (desktop). `bracket`: L-shaped corners (phone). */
  handle?: 'square' | 'bracket';
  /** Rule-of-thirds lines inside the frame. */
  grid?: 'dashed' | 'solid' | 'none';
  /** Smallest frame side as a fraction of the stage; the feature enforces the pixel minimum on save. */
  minSize?: number;
  /** CSS height of the canvas panel (the stage is fitted inside it). */
  height?: string;
  isDisabled?: boolean;
  labels: CropCanvasLabels;
};

function arrowDelta(event: KeyboardEvent): { dx: number; dy: number } | null {
  const step = event.shiftKey ? 0.1 : 0.01;
  switch (event.key) {
    case 'ArrowLeft':
      return { dx: -step, dy: 0 };
    case 'ArrowRight':
      return { dx: step, dy: 0 };
    case 'ArrowUp':
      return { dx: 0, dy: -step };
    case 'ArrowDown':
      return { dx: 0, dy: step };
    default:
      return null;
  }
}

/**
 * Crop stage: the image, a dimmed area outside the frame, the white frame with four corner handles and thirds lines.
 * Pointer: drag inside the frame to move it, drag a corner to resize. Keyboard: the region moves the frame by 1 %
 * (Shift 10 %), a focused corner resizes by the same step. Mapping the frame to source pixels is the feature's job.
 */
export function CropCanvas({
  src,
  imageAspect,
  frame,
  onFrameChange,
  lockedRatio,
  zoom = 1,
  rotation = 0,
  handle = 'square',
  grid = 'dashed',
  minSize = 0.1,
  height = 'clamp(280px, 52vh, 420px)',
  isDisabled = false,
  labels
}: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const drag = useRef<
    { kind: 'move'; startX: number; startY: number; origin: CropFrame } | { kind: 'corner'; corner: CropCorner } | null
  >(null);

  const quarterTurns = (((Math.round(rotation / 90) % 4) + 4) % 4) as 0 | 1 | 2 | 3;
  const odd = quarterTurns % 2 === 1;

  function stageSize(): StageSize {
    const rect = stageRef.current?.getBoundingClientRect();
    return { width: rect?.width ?? 1, height: rect?.height ?? 1 };
  }

  function toFraction(event: PointerEvent): { x: number; y: number } {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return { x: 0, y: 0 };
    return { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height };
  }

  function startMove(event: PointerEvent<HTMLDivElement>) {
    if (isDisabled || event.button > 0) return;
    const at = toFraction(event);
    drag.current = { kind: 'move', startX: at.x, startY: at.y, origin: frame };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function startCorner(event: PointerEvent<HTMLButtonElement>, corner: CropCorner) {
    if (isDisabled || event.button > 0) return;
    event.stopPropagation();
    drag.current = { kind: 'corner', corner };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: PointerEvent<HTMLElement>) {
    // A corner is inside the frame, so its events bubble: handle them once.
    event.stopPropagation();
    const state = drag.current;
    if (!state) return;
    const at = toFraction(event);
    if (state.kind === 'move') {
      onFrameChange(moveFrame(state.origin, at.x - state.startX, at.y - state.startY));
    } else {
      onFrameChange(resizeFromCorner(frame, state.corner, at.x, at.y, stageSize(), minSize, lockedRatio));
    }
  }

  function endDrag(event: PointerEvent<HTMLElement>) {
    event.stopPropagation();
    if (!drag.current) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function onRegionKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (isDisabled || event.target !== event.currentTarget) return;
    const delta = arrowDelta(event);
    if (!delta) return;
    event.preventDefault();
    onFrameChange(moveFrame(frame, delta.dx, delta.dy));
  }

  function onCornerKeyDown(event: KeyboardEvent<HTMLButtonElement>, corner: CropCorner) {
    if (isDisabled) return;
    const delta = arrowDelta(event);
    if (!delta) return;
    event.preventDefault();
    const point = cornerPoint(frame, corner);
    onFrameChange(
      resizeFromCorner(frame, corner, point.x + delta.dx, point.y + delta.dy, stageSize(), minSize, lockedRatio)
    );
  }

  const imageStyle: CSSProperties = odd
    ? {
        width: `${100 / imageAspect}%`,
        height: `${100 * imageAspect}%`,
        transform: `translate(-50%, -50%) rotate(${quarterTurns * 90}deg)`
      }
    : {
        width: '100%',
        height: '100%',
        transform: `translate(-50%, -50%) rotate(${quarterTurns * 90}deg)`
      };

  return (
    <div className={styles.canvas} style={{ height }} data-disabled={isDisabled || undefined}>
      {/* The stage has the image's shape, so frame fractions are image fractions. */}
      <div ref={stageRef} className={styles.stage} style={{ '--crop-aspect': imageAspect } as CSSProperties}>
        <div className={styles.zoomLayer} style={{ transform: `scale(${zoom})` }}>
          <img src={src} alt="" draggable={false} className={styles.image} style={imageStyle} />
        </div>
        {/* The frame is the keyboard region: a custom pointer widget, as in the APG slider/application patterns. */}
        {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */}
        <div
          role="application"
          aria-label={labels.region}
          tabIndex={isDisabled ? -1 : 0}
          className={styles.frame}
          data-handle={handle}
          style={{
            left: `${frame.x * 100}%`,
            top: `${frame.y * 100}%`,
            width: `${frame.w * 100}%`,
            height: `${frame.h * 100}%`
          }}
          onPointerDown={startMove}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onKeyDown={onRegionKeyDown}
        >
          {grid === 'none' ? null : (
            <span className={styles.grid} data-line={grid} aria-hidden="true">
              <span className={styles.lineV1} />
              <span className={styles.lineV2} />
              <span className={styles.lineH1} />
              <span className={styles.lineH2} />
            </span>
          )}
          {CORNERS.map((corner) => (
            <button
              key={corner}
              type="button"
              aria-label={labels.corners[corner]}
              disabled={isDisabled}
              data-corner={corner}
              className={styles.handle}
              onPointerDown={(event) => startCorner(event, corner)}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              onKeyDown={(event) => onCornerKeyDown(event, corner)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
