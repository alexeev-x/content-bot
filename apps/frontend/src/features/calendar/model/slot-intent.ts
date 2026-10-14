import { parseDateTime } from '@internationalized/date';
import { utcOffsetLabel } from '../../../shared/lib/owner-timezone';
import { resolveLocalTime } from '../../../shared/ui/date-time-resolution';

export type CalendarSlotIntent = {
  slot?: string;
  timezone?: string;
  destinationId?: string;
  fold?: 'first' | 'second';
};

/** Returns no displayable intent when a fold has not been explicitly resolved. */
export function describeSlotIntent(slot: string, timezone: string, fold: CalendarSlotIntent['fold']): string | null {
  try {
    const local = parseDateTime(slot);
    const resolution = resolveLocalTime(local, timezone);
    const candidate =
      resolution.kind === 'unique'
        ? resolution.candidates[0]
        : resolution.kind === 'fold' && fold
          ? resolution.candidates[fold === 'second' ? 1 : 0]
          : null;
    if (!candidate) return null;
    const localDate = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'long', timeZone: 'UTC' }).format(
      local.toDate('UTC')
    );
    const time = `${String(local.hour).padStart(2, '0')}:${String(local.minute).padStart(2, '0')}`;
    return `${localDate}, ${time}, ${timezone} (${utcOffsetLabel(candidate.toDate(), timezone)})`;
  } catch {
    return null;
  }
}
