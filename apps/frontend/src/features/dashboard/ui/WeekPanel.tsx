import { Link } from '@tanstack/react-router';
import { Button, Skeleton } from '../../../shared/ui';
import { WEEK_DAYS, type WeekDay } from '../model/week';
import { copy } from './copy';
import styles from './Dashboard.module.css';
import { EmptyLine, PanelLink, Section } from './DashboardPanel';

type Props = {
  /** Seven days with their scheduled counts; undefined while loading. */
  days: readonly WeekDay[] | undefined;
  failed?: boolean;
  onRetry?: () => void;
  /** The page of publications was full: the counts are a lower bound. */
  truncated?: boolean;
  limit: number;
  timezone?: string;
};

/** The next 7 days as a strip: weekday, date and the scheduled count; empty days stay visible with a zero. */
export function WeekPanel({ days, failed, onRetry, truncated, limit, timezone = 'Europe/Moscow' }: Props) {
  const weekday = new Intl.DateTimeFormat('ru-RU', { weekday: 'short', timeZone: timezone });
  const dayMonth = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', timeZone: timezone });
  return (
    <Section
      area="week"
      title={copy.week.title}
      action={<PanelLink to="/publications" search={{ view: 'upcoming' }} text={copy.week.all} />}
      rows={2}
      busy={days === undefined && !failed}
    >
      {failed ? (
        <EmptyLine
          text={copy.widgetError}
          action={
            onRetry ? (
              <Button size="sm" variant="ghost" onPress={onRetry}>
                {copy.retry}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className={styles.weekBody}>
          <ol className={styles.week} aria-label={copy.week.title}>
            {days === undefined
              ? Array.from({ length: WEEK_DAYS }, (_, index) => (
                  <li key={index} className={styles.weekDay} aria-hidden="true">
                    <Skeleton width="60%" height={12} />
                    <Skeleton width="40%" height={20} />
                  </li>
                ))
              : days.map((day) => {
                  const name = `${weekday.format(day.start)}, ${dayMonth.format(day.start)}`;
                  return (
                    <li key={day.start.toISOString()} className={styles.weekItem}>
                      <Link
                        to="/publications"
                        search={{ view: 'upcoming', from: day.from, to: day.to }}
                        className={styles.weekDay}
                        data-today={day.isToday || undefined}
                        data-empty={day.count === 0 || undefined}
                        aria-label={copy.week.dayLabel(name, day.count)}
                        title={`${name}, ${timezone}`}
                      >
                        <span className={styles.weekName}>{weekday.format(day.start)}</span>
                        <span className={styles.weekDate}>{day.start.getDate()}</span>
                        <span className={styles.weekCount}>{day.count}</span>
                      </Link>
                    </li>
                  );
                })}
          </ol>
          <p className={styles.weekHint}>{truncated ? copy.week.truncated(limit) : copy.week.hint}</p>
        </div>
      )}
    </Section>
  );
}
