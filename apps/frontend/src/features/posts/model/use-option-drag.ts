import { useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';

const DRAG_THRESHOLD_PX = 4;
// Near the top or bottom edge of the screen the page scrolls on its own, so a row can be carried past the fold.
const EDGE_SCROLL_ZONE_PX = 64;
const EDGE_SCROLL_STEP_PX = 12;

type Options = {
  /** The list whose direct children are the rows, in order. */
  listRef: { readonly current: HTMLElement | null };
  count: number;
  isDisabled: boolean;
  onMove: (from: number, to: number) => void;
};

/** A drag in progress. Rows are measured once at its start in page coordinates; nothing is reordered until the drop. */
type Drag = {
  pointerId: number;
  from: number;
  startPageY: number;
  moved: boolean;
  /** Page-space middles of the rows at the start. */
  middles: number[];
  /** How far a row moves to make room: the dragged row's height plus the list gap. */
  step: number;
};

type Shown = { from: number; target: number; dy: number; step: number };

/**
 * Reordering by a handle at the start of each row (owner, 18.10.2026: no arrows; then «не понятно, что я схватил и
 * куда вставлю»). The grabbed row lifts and follows the pointer, the others slide apart to show where it lands, and the
 * list changes only on release. Two more ways, so no one depends on dragging (WCAG 2.5.7): press the handle to lift
 * the row and press another row's handle to put it there; or focus the handle and use ArrowUp/ArrowDown.
 */
export function useOptionDrag({ listRef, count, isDisabled, onMove }: Options) {
  const drag = useRef<Drag | null>(null);
  const [shown, setShown] = useState<Shown | null>(null);
  // Right after a drop the rows take their new places with no slide back from the old offsets.
  const [settling, setSettling] = useState(false);
  const [lifted, setLifted] = useState<number | null>(null);
  // Where the moved row went, for the live region; null before the first move.
  const [movedTo, setMovedTo] = useState<number | null>(null);

  function move(from: number, to: number) {
    if (to < 0 || to >= count || from === to) return;
    onMove(from, to);
    setMovedTo(to);
  }

  function start(event: PointerEvent<HTMLButtonElement>, index: number): Drag {
    const rows = Array.from(listRef.current?.children ?? []).map((row) => row.getBoundingClientRect());
    const own = rows[index];
    const next = rows[index + 1] ?? rows[index - 1];
    const gap = own && next ? Math.max(0, next.top > own.top ? next.top - own.bottom : own.top - next.bottom) : 0;
    return {
      pointerId: event.pointerId,
      from: index,
      startPageY: event.clientY + window.scrollY,
      moved: false,
      middles: rows.map((rect) => rect.top + rect.height / 2 + window.scrollY),
      step: (own?.height ?? 0) + gap
    };
  }

  /** The landing place: after every other row whose middle the dragged row's middle has passed. */
  function targetOf(current: Drag, dy: number): number {
    const middle = (current.middles[current.from] ?? 0) + dy;
    return current.middles.filter((value, index) => index !== current.from && value < middle).length;
  }

  function finish() {
    drag.current = null;
    setShown(null);
  }

  /** Inline position of a row while a drag is shown: the dragged one follows the pointer, the rest make room. */
  function rowProps(index: number): { style?: CSSProperties; 'data-dragged'?: true; 'data-settling'?: true } {
    if (settling) return { 'data-settling': true };
    if (shown === null) return {};
    const { from, target, dy, step } = shown;
    if (index === from) return { style: { transform: `translateY(${dy}px)` }, 'data-dragged': true };
    const shift =
      from < target && index > from && index <= target
        ? -step
        : target < from && index >= target && index < from
          ? step
          : 0;
    return shift === 0 ? {} : { style: { transform: `translateY(${shift}px)` } };
  }

  function handleProps(index: number) {
    return {
      'aria-pressed': lifted === index,
      disabled: isDisabled,
      onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
        if (isDisabled || event.button !== 0) return;
        // Keeps the moves coming while the finger leaves the handle; absent in jsdom.
        event.currentTarget.setPointerCapture?.(event.pointerId);
        drag.current = start(event, index);
      },
      onPointerMove: (event: PointerEvent<HTMLButtonElement>) => {
        const current = drag.current;
        if (current === null || current.pointerId !== event.pointerId) return;
        if (event.clientY < EDGE_SCROLL_ZONE_PX) window.scrollBy(0, -EDGE_SCROLL_STEP_PX);
        else if (event.clientY > window.innerHeight - EDGE_SCROLL_ZONE_PX) window.scrollBy(0, EDGE_SCROLL_STEP_PX);
        const dy = event.clientY + window.scrollY - current.startPageY;
        if (!current.moved && Math.abs(dy) < DRAG_THRESHOLD_PX) return;
        if (!current.moved) {
          current.moved = true;
          setLifted(null);
        }
        setShown({ from: current.from, target: targetOf(current, dy), dy, step: current.step });
      },
      onPointerUp: (event: PointerEvent<HTMLButtonElement>) => {
        const current = drag.current;
        if (current === null || current.pointerId !== event.pointerId) return;
        if (current.moved) {
          const target = targetOf(current, event.clientY + window.scrollY - current.startPageY);
          finish();
          if (target !== current.from) {
            setSettling(true);
            move(current.from, target);
            // Two frames: the reordered rows paint at their places first, then transitions come back.
            requestAnimationFrame(() => requestAnimationFrame(() => setSettling(false)));
          }
          return;
        }
        finish();
        // A press without movement: lift this row, or put the lifted one here.
        if (lifted === null) setLifted(index);
        else {
          move(lifted, index);
          setLifted(null);
        }
      },
      onPointerCancel: finish,
      onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => {
        if (isDisabled) return;
        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
          event.preventDefault();
          move(index, index + (event.key === 'ArrowUp' ? -1 : 1));
          setLifted(null);
        } else if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          if (lifted === null) setLifted(index);
          else {
            move(lifted, index);
            setLifted(null);
          }
        } else if (event.key === 'Escape' && lifted !== null) {
          event.preventDefault();
          setLifted(null);
        }
      }
    };
  }

  return { handleProps, rowProps, lifted, movedTo, isDragging: shown !== null };
}
