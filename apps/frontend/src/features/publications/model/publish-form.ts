import { now, type ZonedDateTime } from '@internationalized/date';
import { z } from 'zod';
import { copy } from '../ui/copy';

export const MAX_DAYS_AHEAD = 366;
const DAY_MS = 86_400_000;

export const publishFormSchema = z
  .object({
    destinationId: z.string().min(1, copy.publish.needChannel),
    mode: z.enum(['now', 'later']),
    scheduledAt: z.custom<ZonedDateTime | null>(
      (value) => value === null || (typeof value === 'object' && value !== null && 'toDate' in value)
    )
  })
  .superRefine((value, context) => {
    if (value.mode !== 'later') return;
    if (value.scheduledAt === null) {
      context.addIssue({ code: 'custom', path: ['scheduledAt'], message: copy.publish.needTime });
      return;
    }
    const at = value.scheduledAt.toDate().getTime();
    if (at <= Date.now()) {
      context.addIssue({ code: 'custom', path: ['scheduledAt'], message: copy.publish.timeInPast });
    } else if (at > Date.now() + MAX_DAYS_AHEAD * DAY_MS) {
      context.addIssue({ code: 'custom', path: ['scheduledAt'], message: copy.publish.timeTooFar });
    }
  });

export type PublishFormValues = z.infer<typeof publishFormSchema>;

/** Next full hour in the operator's zone: a sensible starting point for «Запланировать». */
export function defaultScheduledAt(timeZone: string): ZonedDateTime {
  return now(timeZone).add({ hours: 1 }).set({ minute: 0, second: 0, millisecond: 0 });
}
