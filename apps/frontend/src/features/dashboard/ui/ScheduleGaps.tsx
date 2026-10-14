import { useQuery } from '@tanstack/react-query';
import { Button as AriaButton } from 'react-aria-components';
import { ownerDayRanges } from '../../../shared/lib/owner-timezone';
import { pluralRu } from '../../../shared/lib/ru-format';
import { Icon, Skeleton } from '../../../shared/ui';
import { plannedQueryOptions } from '../api/dashboard-queries';
import { copy } from './copy';
import shell from './Dashboard.module.css';
import styles from './ScheduleGaps.module.css';
import { Widget } from './Widget';

const DAYS = 7;

type Props = {
  now: Date;
  timezone: string;
  onOpenDay: (day: { from: string; to: string }) => void;
  onNewPost: () => void;
};

/** The next seven days in the owner's zone: how many publications each holds; an empty day invites a post. */
export function ScheduleGaps({ now, timezone, onOpenDay, onNewPost }: Props) {
  const days = ownerDayRanges(now, timezone, DAYS);
  const first = days[0];
  const last = days[DAYS - 1];
  const query = useQuery({
    ...plannedQueryOptions({ from: first?.from ?? '', to: last?.to ?? '' }),
    enabled: first !== undefined && last !== undefined
  });
  const planned = query.data?.items.filter((item) => item.status !== 'cancelled');
  const counts = days.map(
    (day) => planned?.filter((item) => item.scheduledAt >= day.from && item.scheduledAt < day.to).length ?? undefined
  );
  const empty = counts.filter((count) => count === 0).length;
  const weekday = new Intl.DateTimeFormat('ru-RU', { timeZone: timezone, weekday: 'short' });
  const date = new Intl.DateTimeFormat('ru-RU', { timeZone: timezone, day: 'numeric' });

  return (
    <Widget id="schedule-gaps" title={copy.gaps.title} busy={query.isPending}>
      <div className={shell.body}>
        <p className={shell.quiet}>
          {planned === undefined ? copy.gaps.loading : empty === 0 ? copy.gaps.full : copy.gaps.summary(empty)}
        </p>
        <ul className={styles.days}>
          {days.map((day, index) => {
            const count = counts[index];
            const label = `${weekday.format(new Date(day.from))} ${date.format(new Date(day.from))}`;
            return (
              <li key={day.from}>
                {count === undefined ? (
                  <Skeleton height={64} radius="var(--radius-2)" />
                ) : (
                  <AriaButton
                    className={styles.day}
                    data-empty={count === 0 || undefined}
                    aria-label={
                      count === 0
                        ? copy.gaps.emptyDay(label)
                        : copy.gaps.day(label, count, pluralRu(count, 'публикация', 'публикации', 'публикаций'))
                    }
                    onPress={() => (count === 0 ? onNewPost() : onOpenDay(day))}
                  >
                    <span className={styles.label}>{label}</span>
                    {count === 0 ? <Icon name="plus" size={16} /> : <span className={styles.count}>{count}</span>}
                  </AriaButton>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </Widget>
  );
}
