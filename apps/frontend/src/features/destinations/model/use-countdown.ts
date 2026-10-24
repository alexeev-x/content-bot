import { useCallback, useEffect, useState } from 'react';

type Clock = { deadline: number; now: number };

/** A one-shot countdown: `start(seconds)` begins it, `secondsLeft` ticks once a second down to 0. */
export function useCountdown(): { secondsLeft: number; start: (seconds: number) => void } {
  const [clock, setClock] = useState<Clock | null>(null);
  const deadline = clock?.deadline ?? null;

  useEffect(() => {
    if (deadline === null) return undefined;
    const id = setInterval(() => {
      const now = Date.now();
      setClock({ deadline, now });
      if (now >= deadline) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [deadline]);

  const start = useCallback((seconds: number) => {
    const now = Date.now();
    setClock({ deadline: now + seconds * 1000, now });
  }, []);

  return {
    secondsLeft: clock === null ? 0 : Math.max(0, Math.ceil((clock.deadline - clock.now) / 1000)),
    start
  };
}
