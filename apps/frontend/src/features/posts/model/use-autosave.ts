import { useEffect, useRef } from 'react';

const AUTOSAVE_DELAY_MS = 1_200;

type Options = {
  enabled: boolean;
  /** Changes whenever the draft content changes, so the debounce restarts. */
  changeKey: string;
  onSave: () => void;
};

/** Debounced draft autosave. The callback itself stays in a ref so rendering it anew does not restart the timer. */
export function useAutosave({ enabled, changeKey, onSave }: Options): void {
  const saveRef = useRef(onSave);

  useEffect(() => {
    saveRef.current = onSave;
  });

  useEffect(() => {
    if (!enabled) return;
    const timer = window.setTimeout(() => {
      // Reading the snapshot makes the content dependency explicit: a different snapshot cancels this timer.
      void changeKey;
      saveRef.current();
    }, AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [enabled, changeKey]);
}
