// Pan and zoom of one picture inside a viewport. Offsets are measured from the viewport centre and the picture
// is laid out "contained" at scale 1, so the limits only depend on the two box sizes.

export type ViewTransform = { scale: number; x: number; y: number };
type Size = { width: number; height: number };

export const MIN_SCALE = 1;
export const MAX_SCALE = 8;
export const FIT: ViewTransform = { scale: MIN_SCALE, x: 0, y: 0 };

// `+ 0` turns a -0 result into 0.
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value)) + 0;

/** Keeps the picture covering the viewport once it is larger than it; a smaller picture stays centred. */
export function clampPan(view: ViewTransform, content: Size, viewport: Size): ViewTransform {
  const scale = clamp(view.scale, MIN_SCALE, MAX_SCALE);
  const limitX = Math.max(0, (content.width * scale - viewport.width) / 2);
  const limitY = Math.max(0, (content.height * scale - viewport.height) / 2);
  return { scale, x: clamp(view.x, -limitX, limitX), y: clamp(view.y, -limitY, limitY) };
}

/** Zooms to `nextScale` keeping the point under `focus` (from the viewport centre) still under it. */
export function zoomAt(
  view: ViewTransform,
  nextScale: number,
  focus: { x: number; y: number },
  content: Size,
  viewport: Size
): ViewTransform {
  const scale = clamp(nextScale, MIN_SCALE, MAX_SCALE);
  const ratio = scale / view.scale;
  return clampPan(
    { scale, x: focus.x - (focus.x - view.x) * ratio, y: focus.y - (focus.y - view.y) * ratio },
    content,
    viewport
  );
}
