import type { PublicationPageDto } from '@alexeev/contracts';
import type { UseQueryResult } from '@tanstack/react-query';
import { useMemo } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import { Button, Skeleton } from '../../../shared/ui';
import { countByDay, weekDays } from '../model/week';
import { copy } from './copy';
import shell from './Dashboard.module.css';
import styles from './WeekBars.module.css';
import { Widget } from './Widget';

const SKELETON_HEIGHTS = [45, 70, 30, 85, 55, 20, 40];

type Props = {
  query: UseQueryResult<PublicationPageDto> | undefined;
  now: Date;
  timezone: string;
  onOpenDay: (day: { from: string; to: string }) => void;
};

/** Seven vertical bars for the current week in the owner's zone: sent, still scheduled and trouble stacked, today highlighted. */
export function WeekBars({ query, now, timezone, onOpenDay }: Props) {
  const days = useMemo(() => weekDays(now, timezone), [now, timezone]);
  const items = query?.data?.items;
  const counts = useMemo(() => (items ? countByDay(items, days) : undefined), [items, days]);
  const failed = query !== undefined && !query.data && !query.isPending;
  const max = Math.max(1, ...(counts ?? []).map((day) => day.scheduled + day.sent + day.problem));
  const sum = (key: 'scheduled' | 'sent' | 'problem') => (counts ?? []).reduce((total, day) => total + day[key], 0);
  const partial = query?.data?.nextCursor != null;
  return (
    <Widget id="week" title={copy.week.title} busy={query === undefined || query.isPending}>
      <div className={shell.body}>
        {failed ? (
          <div className={styles.error}>
            <p className={shell.quiet}>{copy.week.error}</p>
            <Button size="sm" variant="secondary" onPress={() => void query.refetch()}>
              {copy.week.retry}
            </Button>
          </div>
        ) : (
          <>
            <ul className={styles.chart} aria-label={copy.week.title}>
              {days.map((day, index) => {
                const count = counts?.[index];
                const total = count ? count.scheduled + count.sent + count.problem : 0;
                return (
                  <li key={day.from} className={styles.column} data-today={day.isToday || undefined}>
                    {count ? (
                      <AriaButton
                        className={styles.hit}
                        aria-label={copy.week.day(day.long, count.scheduled, count.sent, count.problem)}
                        aria-current={day.isToday ? 'date' : undefined}
                        onPress={() => onOpenDay({ from: day.from, to: day.to })}
                      >
                        <span className={styles.total}>{total}</span>
                        <span className={styles.stack}>
                          <span
                            className={styles.bar}
                            style={total === 0 ? undefined : { height: `${(total / max) * 100}%` }}
                          >
                            {count.problem > 0 ? (
                              <span className={styles.problem} style={{ flexGrow: count.problem }} />
                            ) : null}
                            {count.scheduled > 0 ? (
                              <span className={styles.scheduled} style={{ flexGrow: count.scheduled }} />
                            ) : null}
                            {count.sent > 0 ? <span className={styles.sent} style={{ flexGrow: count.sent }} /> : null}
                            {total === 0 ? <span className={styles.stub} /> : null}
                          </span>
                        </span>
                        <span className={styles.day}>{day.short}</span>
                      </AriaButton>
                    ) : (
                      <span className={styles.hit} aria-hidden="true">
                        <span className={styles.total} />
                        <span className={styles.stack}>
                          <span className={styles.bar} style={{ height: `${SKELETON_HEIGHTS[index]}%` }}>
                            <span className={styles.fill}>
                              <Skeleton height="100%" radius="var(--radius-1)" />
                            </span>
                          </span>
                        </span>
                        <span className={styles.day}>{day.short}</span>
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
            <ul className={styles.legend}>
              <li data-kind="sent">{copy.week.sent}</li>
              <li data-kind="scheduled">{copy.week.scheduled}</li>
              <li data-kind="problem">{copy.week.problem}</li>
            </ul>
            {counts ? (
              <p className={shell.srOnly}>{copy.week.summary(sum('scheduled'), sum('sent'), sum('problem'))}</p>
            ) : null}
            {partial ? <p className={shell.quiet}>{copy.week.partial}</p> : null}
          </>
        )}
      </div>
    </Widget>
  );
}
