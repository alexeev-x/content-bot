import { useState } from 'react';

/**
 * Tab data comes from a cache keyed per tab and the previous rows stay on screen (`placeholderData`).
 * `shownScope` is the tab whose rows are on screen now; `switching` is true while the new tab still loads.
 */
export function useTabSwitch(scope: string, isPlaceholderData: boolean) {
  const [settled, setSettled] = useState(scope);
  if (!isPlaceholderData && settled !== scope) setSettled(scope);
  const switching = isPlaceholderData && settled !== scope;
  return { switching, shownScope: switching ? settled : scope };
}
