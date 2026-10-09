import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';

const MOUSE_SLOP = 5;
const TOUCH_HOLD_MS = 280;
const TOUCH_SLOP = 10;

const swallowClick = (e: MouseEvent) => {
  e.stopPropagation();
  e.preventDefault();
};

export type DragView = { from: number; over: number; dx: number; dy: number } | null;

type Session = {
  from: number;
  pointerId: number;
  touch: boolean;
  startX: number;
  startY: number;
  active: boolean;
  over: number;
  timer: number | undefined;
};

/**
 * Pointer drag-and-drop for the media tiles. Mouse starts after a few pixels, touch after a short hold so a
 * swipe still scrolls the page. The drop target is the tile nearest to the pointer; the order changes on drop.
 * Keyboard order stays on the Alt+Arrow handler in the media block.
 */
export function usePointerReorder(
  container: RefObject<HTMLElement | null>,
  onMove: (from: number, to: number) => void,
  onNote: (text: string) => void
) {
  const [view, setView] = useState<DragView>(null);
  const session = useRef<Session | null>(null);
  const cleanup = useRef<(() => void) | null>(null);
  const moveRef = useRef(onMove);
  const noteRef = useRef(onNote);
  useEffect(() => {
    moveRef.current = onMove;
    noteRef.current = onNote;
  });
  useEffect(() => () => cleanup.current?.(), []);

  function nearest(x: number, y: number): number {
    const nodes = container.current?.querySelectorAll<HTMLElement>('[data-reorder-item]') ?? [];
    let best = 0;
    let bestDistance = Infinity;
    nodes.forEach((node, index) => {
      const rect = node.getBoundingClientRect();
      const distance = Math.hypot(x - (rect.left + rect.width / 2), y - (rect.top + rect.height / 2));
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index;
      }
    });
    return best;
  }

  function start(index: number, event: ReactPointerEvent) {
    if (event.button !== 0 || session.current) return;
    const touch = event.pointerType === 'touch' || event.pointerType === 'pen';
    const s: Session = {
      from: index,
      pointerId: event.pointerId,
      touch,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
      over: index,
      timer: undefined
    };
    session.current = s;
    const blockTouchScroll = (e: TouchEvent) => {
      if (s.active && e.cancelable) e.preventDefault();
    };
    const blockMenu = (e: Event) => {
      if (touch) e.preventDefault();
    };
    const activate = () => {
      s.active = true;
      document.body.setAttribute('data-reordering', '');
      setView({ from: s.from, over: s.from, dx: 0, dy: 0 });
      noteRef.current(`Файл ${s.from + 1} поднят. Перетащите на новое место и отпустите`);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerId !== s.pointerId) return;
      const dx = e.clientX - s.startX;
      const dy = e.clientY - s.startY;
      if (!s.active) {
        const distance = Math.hypot(dx, dy);
        if (touch && distance > TOUCH_SLOP) return end(false);
        if (!touch && distance > MOUSE_SLOP) activate();
        else return;
      }
      s.over = nearest(e.clientX, e.clientY);
      setView({ from: s.from, over: s.over, dx, dy });
    };
    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerId !== s.pointerId) return;
      end(true, s.over);
    };
    const onPointerCancel = (e: PointerEvent) => {
      if (e.pointerId === s.pointerId) end(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && s.active) {
        e.preventDefault();
        noteRef.current(`Перемещение отменено, файл ${s.from + 1} на прежней позиции`);
        end(false);
      }
    };
    function end(commit: boolean, over = s.from) {
      window.clearTimeout(s.timer);
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
      document.removeEventListener('pointercancel', onPointerCancel);
      document.removeEventListener('touchmove', blockTouchScroll);
      document.removeEventListener('contextmenu', blockMenu);
      document.removeEventListener('keydown', onKey, true);
      document.body.removeAttribute('data-reordering');
      if (s.active) {
        document.addEventListener('click', swallowClick, { capture: true, once: true });
        window.setTimeout(() => document.removeEventListener('click', swallowClick, true), 0);
      }
      session.current = null;
      cleanup.current = null;
      setView(null);
      if (commit && s.active && over !== s.from) {
        moveRef.current(s.from, over);
        noteRef.current(`Файл ${s.from + 1} перемещён на позицию ${over + 1}`);
      }
    }
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('pointercancel', onPointerCancel);
    document.addEventListener('touchmove', blockTouchScroll, { passive: false });
    document.addEventListener('contextmenu', blockMenu);
    document.addEventListener('keydown', onKey, true);
    cleanup.current = () => end(false);
    if (touch) s.timer = window.setTimeout(activate, TOUCH_HOLD_MS);
  }

  return { view, start };
}
