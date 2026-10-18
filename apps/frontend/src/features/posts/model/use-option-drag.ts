import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';

const DRAG_THRESHOLD_PX = 4;

type Options = {
  /** The list whose direct children are the rows, in order. */
  listRef: { readonly current: HTMLElement | null };
  count: number;
  isDisabled: boolean;
  onMove: (from: number, to: number) => void;
};

type Drag = { pointerId: number; startY: number; index: number; moved: boolean };

/**
 * Reordering by a handle at the start of each row (owner, 18.10.2026: no arrows, drag instead). Three ways, so no one
 * depends on dragging (WCAG 2.5.7): drag the handle with a mouse or a finger; press it to lift the row and press
 * another row's handle to put it there; or focus it and use ArrowUp/ArrowDown. The rows move live while dragging.
 */
export function useOptionDrag({ listRef, count, isDisabled, onMove }: Options) {
  const drag = useRef<Drag | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [lifted, setLifted] = useState<number | null>(null);
  // Where the moved row went, for the live region; null before the first move.
  const [movedTo, setMovedTo] = useState<number | null>(null);

  function move(from: number, to: number) {
    if (to < 0 || to >= count || from === to) return;
    onMove(from, to);
    setMovedTo(to);
  }

  /** Where the dragged row belongs: after every other row whose middle the pointer has passed. */
  function indexAt(clientY: number, dragged: number): number {
    const rows = Array.from(listRef.current?.children ?? []);
    return rows.filter((row, index) => {
      if (index === dragged) return false;
      const rect = row.getBoundingClientRect();
      return rect.top + rect.height / 2 < clientY;
    }).length;
  }

  function handleProps(index: number) {
    return {
      'data-dragging': dragging === index || undefined,
      'aria-pressed': lifted === index,
      disabled: isDisabled,
      onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
        if (isDisabled || event.button !== 0) return;
        // Keeps the moves coming while the finger leaves the handle; absent in jsdom.
        event.currentTarget.setPointerCapture?.(event.pointerId);
        drag.current = { pointerId: event.pointerId, startY: event.clientY, index, moved: false };
      },
      onPointerMove: (event: PointerEvent<HTMLButtonElement>) => {
        const current = drag.current;
        if (current === null || current.pointerId !== event.pointerId) return;
        if (!current.moved && Math.abs(event.clientY - current.startY) < DRAG_THRESHOLD_PX) return;
        if (!current.moved) {
          current.moved = true;
          setLifted(null);
        }
        setDragging(current.index);
        const target = indexAt(event.clientY, current.index);
        if (target !== current.index) {
          move(current.index, target);
          current.index = target;
          setDragging(target);
        }
      },
      onPointerUp: (event: PointerEvent<HTMLButtonElement>) => {
        const current = drag.current;
        drag.current = null;
        setDragging(null);
        if (current === null || current.pointerId !== event.pointerId || current.moved) return;
        // A press without movement: lift this row, or put the lifted one here.
        if (lifted === null) setLifted(index);
        else {
          move(lifted, index);
          setLifted(null);
        }
      },
      onPointerCancel: () => {
        drag.current = null;
        setDragging(null);
      },
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

  return { handleProps, lifted, movedTo };
}
