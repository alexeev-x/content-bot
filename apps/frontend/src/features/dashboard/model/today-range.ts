import { useEffect, useState } from 'react';
import type { DayRange } from '../api/dashboard-api';

/** The UTC instants of the browser-zone day containing `now`: [local midnight, next local midnight). */
export function todayRange(now: Date): DayRange {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return { from: start.toISOString(), to: end.toISOString() };
}

/** Today's range; rolls over at local midnight so a tab left open overnight does not keep asking for yesterday. */
export function useTodayRange(): DayRange {
  const [range, setRange] = useState(() => todayRange(new Date()));
  useEffect(() => {
    const wait = Math.max(1000, Date.parse(range.to) - Date.now());
    const timer = setTimeout(() => setRange(todayRange(new Date())), wait);
    return () => clearTimeout(timer);
  }, [range]);
  return range;
}
