import { useEffect, useState } from 'react';
import { ownerDayRange } from '../../../shared/lib/owner-timezone';
import type { DayRange } from '../api/dashboard-api';

/** The UTC instants of the operator-zone day containing `now`: [local midnight, next local midnight). */
export function todayRange(now: Date, timeZone: string): DayRange {
  return ownerDayRange(now, timeZone);
}

/** Today's range; rolls over at local midnight so a tab left open overnight does not keep asking for yesterday. */
export function useTodayRange(timeZone: string): DayRange {
  const [range, setRange] = useState(() => todayRange(new Date(), timeZone));
  useEffect(() => {
    const wait = Math.max(1000, Date.parse(range.to) - Date.now());
    const timer = setTimeout(() => setRange(todayRange(new Date(), timeZone)), wait);
    return () => clearTimeout(timer);
  }, [range, timeZone]);
  return range;
}
