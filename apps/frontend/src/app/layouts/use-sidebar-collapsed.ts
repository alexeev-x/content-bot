import { useCallback, useState } from 'react';

const KEY = 'ui-sidebar-collapsed';

function read(): boolean {
  try {
    return window.localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

/** Per-viewer sidebar state; storage can be blocked (private mode, Mini App), then it lives only in memory. */
export function useSidebarCollapsed(): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState(read);
  const toggle = useCallback(() => {
    setCollapsed((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(KEY, next ? '1' : '0');
      } catch {
        // Not persisted: the choice still applies for this session.
      }
      return next;
    });
  }, []);
  return [collapsed, toggle];
}
