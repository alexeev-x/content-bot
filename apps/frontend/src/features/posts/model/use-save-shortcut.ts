import { useEffect, useRef } from 'react';

/** Ctrl/⌘+S runs `onSave` instead of the browser's «save page» dialog; removed on unmount. */
export function useSaveShortcut(onSave: () => void): void {
  const handler = useRef(onSave);
  useEffect(() => {
    handler.current = onSave;
  });
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 's') {
        event.preventDefault();
        handler.current();
      }
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);
}
