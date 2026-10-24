import { useSyncExternalStore } from 'react';
import type { ThemeName } from './appearance-value';

const read = (): ThemeName => (document.documentElement.dataset['theme'] === 'light' ? 'light' : 'dark');

function subscribe(notify: () => void): () => void {
  const observer = new MutationObserver(notify);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => observer.disconnect();
}

/** The theme that is on screen right now (live previews included), read from <html>; no data-theme means dark. */
export function useScreenTheme(): ThemeName {
  return useSyncExternalStore(subscribe, read, () => 'dark');
}

export { read as readScreenTheme };
