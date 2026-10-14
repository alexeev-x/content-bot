import { useEffect, useState } from 'react';

const MINUTE_MS = 60_000;

/** The current time at minute precision. Ticks only while the tab is visible and catches up when it returns. */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== 'visible') return;
      const next = new Date();
      setNow((previous) =>
        Math.floor(previous.getTime() / MINUTE_MS) === Math.floor(next.getTime() / MINUTE_MS) ? previous : next
      );
    };
    const timer = setInterval(tick, MINUTE_MS);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, []);
  return now;
}
