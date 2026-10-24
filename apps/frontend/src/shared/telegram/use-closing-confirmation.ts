import { useEffect } from 'react';
import { setClosingConfirmation } from './web-app';

// Several dirty forms can be mounted at once; confirmation stays on until the last one is clean.
// A plain counter, never user data.
let dirtyHolders = 0;

/** Asks Telegram to confirm closing while `dirty` is true; no-op outside Telegram. */
export function useClosingConfirmation(dirty: boolean): void {
  useEffect(() => {
    if (!dirty) return;
    dirtyHolders += 1;
    setClosingConfirmation(true);
    return () => {
      dirtyHolders -= 1;
      if (dirtyHolders === 0) setClosingConfirmation(false);
    };
  }, [dirty]);
}
