import { useEffect, useState } from 'react';
import { Button } from '../../../shared/ui';
import { copy } from './copy';

const RESET_MS = 2000;

/** Copies a value and says so on the button itself (a polite status would need its own live region per row). */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!done) return;
    const timer = setTimeout(() => setDone(false), RESET_MS);
    return () => clearTimeout(timer);
  }, [done]);
  return (
    <Button
      size="sm"
      variant="ghost"
      aria-label={`${copy.row.copy}: ${label}`}
      onPress={() => {
        void navigator.clipboard?.writeText(value).then(() => setDone(true));
      }}
    >
      {done ? copy.row.copied : copy.row.copy}
    </Button>
  );
}
