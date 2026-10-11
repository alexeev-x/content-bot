import { useEffect, useState } from 'react';

/** A minute-resolution clock for date-range UI; keeps time reads out of render and refreshes at midnight boundaries. */
export function useNow(intervalMs = 60_000): Date {
  const [timestamp, setTimestamp] = useState(() => Date.now());

  useEffect(() => {
    const update = () => setTimestamp(Date.now());
    const interval = window.setInterval(update, intervalMs);
    return () => window.clearInterval(interval);
  }, [intervalMs]);

  return new Date(timestamp);
}
