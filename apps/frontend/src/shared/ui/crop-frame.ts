// Pure geometry of the crop frame. Coordinates are fractions (0–1) of the stage, which has the image's aspect.

export type CropFrame = { x: number; y: number; w: number; h: number };
export type CropCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
export type StageSize = { width: number; height: number };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Moves the whole frame, keeping it inside the stage. */
export function moveFrame(frame: CropFrame, dx: number, dy: number): CropFrame {
  return {
    ...frame,
    x: clamp(frame.x + dx, 0, 1 - frame.w),
    y: clamp(frame.y + dy, 0, 1 - frame.h)
  };
}

/**
 * Drags one corner to (px, py) while the opposite corner stays put. With `ratio` (width / height in stage pixels)
 * the frame keeps that shape and the corner follows the pointer along the larger movement.
 */
export function resizeFromCorner(
  frame: CropFrame,
  corner: CropCorner,
  px: number,
  py: number,
  stage: StageSize,
  minSize: number,
  ratio?: number
): CropFrame {
  const left = corner.endsWith('left');
  const top = corner.startsWith('top');
  const anchorX = left ? frame.x + frame.w : frame.x;
  const anchorY = top ? frame.y + frame.h : frame.y;
  const room = { x: left ? anchorX : 1 - anchorX, y: top ? anchorY : 1 - anchorY };
  let w = clamp(Math.abs(clamp(px, 0, 1) - anchorX), 0, room.x);
  let h = clamp(Math.abs(clamp(py, 0, 1) - anchorY), 0, room.y);

  if (ratio !== undefined && stage.width > 0 && stage.height > 0) {
    // Pixel size the ratio asks for, from whichever pointer axis moved further.
    const pxW = w * stage.width;
    const pxH = h * stage.height;
    let nextW = pxW / Math.max(pxH, 1e-6) > ratio ? pxH * ratio : pxW;
    let nextH = nextW / ratio;
    // The smallest frame the ratio allows, and the largest the stage leaves room for.
    const minW = Math.max(minSize * stage.width, minSize * stage.height * ratio);
    nextW = clamp(nextW, minW, Math.min(room.x * stage.width, room.y * stage.height * ratio));
    nextH = nextW / ratio;
    w = nextW / stage.width;
    h = nextH / stage.height;
  } else {
    w = Math.max(w, minSize);
    h = Math.max(h, minSize);
    w = Math.min(w, room.x);
    h = Math.min(h, room.y);
  }
  return { x: left ? anchorX - w : anchorX, y: top ? anchorY - h : anchorY, w, h };
}

/** Position of a corner of the frame. */
export function cornerPoint(frame: CropFrame, corner: CropCorner): { x: number; y: number } {
  return {
    x: corner.endsWith('left') ? frame.x : frame.x + frame.w,
    y: corner.startsWith('top') ? frame.y : frame.y + frame.h
  };
}

/** Largest centred frame of `ratio` (width / height in stage pixels) that fits the stage. */
export function fitFrame(ratio: number, stage: StageSize): CropFrame {
  const stageRatio = stage.width / stage.height;
  const w = ratio >= stageRatio ? 1 : ratio / stageRatio;
  const h = ratio >= stageRatio ? stageRatio / ratio : 1;
  return { x: (1 - w) / 2, y: (1 - h) / 2, w, h };
}
