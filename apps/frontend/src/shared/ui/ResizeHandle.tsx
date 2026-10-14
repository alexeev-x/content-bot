import { useRef, type ChangeEvent, type PointerEvent } from 'react';
import styles from './ResizeHandle.module.css';

type Props = {
  /** Names the handle: «Ширина «Лента дня»». */
  label: string;
  /** The current width in words, read out instead of a number: «Половина». */
  valueText: string;
  /** Position of the current width among the allowed ones, for assistive technology. */
  value: number;
  min: number;
  max: number;
  /** Pointer drag: the pointer's x on screen; the owner snaps it to a width. */
  onDrag: (clientX: number, handle: HTMLElement) => void;
  /** Keyboard (←/→, Home/End): the index of the chosen width among the allowed ones. */
  onSelect: (index: number) => void;
  onDragEnd?: () => void;
};

/**
 * The grip on a card's right edge that makes it wider or narrower. Drag with a mouse or finger, or focus it and
 * use ←/→ (Home/End for the extremes): a native range whose value is spoken as a word. Pointer and key events stop here,
 * so the reorder drag of the surrounding grid never starts from this grip.
 */
export function ResizeHandle({ label, valueText, value, min, max, onDrag, onSelect, onDragEnd }: Props) {
  const dragging = useRef(false);

  const onPointerDown = (event: PointerEvent<HTMLInputElement>) => {
    event.stopPropagation();
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragging.current = true;
  };
  const onPointerMove = (event: PointerEvent<HTMLInputElement>) => {
    if (!dragging.current) return;
    event.stopPropagation();
    onDrag(event.clientX, event.currentTarget);
  };
  const end = (event: PointerEvent<HTMLInputElement>) => {
    if (!dragging.current) return;
    event.stopPropagation();
    dragging.current = false;
    onDragEnd?.();
  };
  // The native range handles the keyboard; its pointer drag is replaced by the column snapping above.
  const onChange = (event: ChangeEvent<HTMLInputElement>) => onSelect(Number(event.target.value));
  const stopKeys = (event: { stopPropagation: () => void }) => event.stopPropagation();

  return (
    <span className={styles.handle}>
      <input
        type="range"
        className={styles.input}
        aria-label={label}
        aria-valuetext={valueText}
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={onChange}
        onKeyDown={stopKeys}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={end}
        onPointerCancel={end}
      />
      <span className={styles.bar} aria-hidden="true" />
    </span>
  );
}
