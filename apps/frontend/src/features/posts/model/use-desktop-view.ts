import { useState } from 'react';

export type DesktopView = 'editor' | 'split' | 'preview';

// The editor's desktop view (owner, 24.10.2026: as GitHub's write/preview) is this viewer's habit, so it is remembered
// in the browser; storage may be missing or blocked, and then the view simply starts as «Вместе».
const KEY = 'post-editor-view';

function read(): DesktopView {
  try {
    const stored = window.localStorage.getItem(KEY);
    return stored === 'editor' || stored === 'preview' ? stored : 'split';
  } catch {
    return 'split';
  }
}

export function useDesktopView(): [DesktopView, (view: DesktopView) => void] {
  const [view, setView] = useState<DesktopView>(read);
  const change = (next: DesktopView) => {
    setView(next);
    try {
      window.localStorage.setItem(KEY, next);
    } catch {
      // Only the memory of the choice is lost.
    }
  };
  return [view, change];
}
