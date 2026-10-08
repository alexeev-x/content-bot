import { useCallback, useLayoutEffect, useRef, useState } from 'react';

/**
 * The live content width of an element, from a ResizeObserver on that element only (never the window or a
 * default), so the grid follows sidebar collapse, scrollbars and window resizes. 0 until the first measurement.
 */
export function useElementWidth() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  const measure = useCallback(() => {
    const node = ref.current;
    if (node) setWidth(Math.floor(node.getBoundingClientRect().width));
  }, []);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect.width;
      if (box !== undefined) setWidth(Math.floor(box));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [measure]);
  return { ref, width };
}
