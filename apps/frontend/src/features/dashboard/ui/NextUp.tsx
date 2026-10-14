import type { DashboardPublicationDto } from '@alexeev/contracts';
import { Link } from '@tanstack/react-router';
import { Button as AriaButton } from 'react-aria-components';
import { formatClock } from '../../../shared/lib/clock';
import { Button, Icon, Skeleton } from '../../../shared/ui';
import { nextPublication, otherDay, untilShort } from '../model/format';
import { avatarLetter } from '../model/tone';
import { copy } from './copy';
import shell from './Dashboard.module.css';
import styles from './NextUp.module.css';
import { Widget } from './Widget';

const FOLLOWING = 3;

type Props = {
  today: readonly DashboardPublicationDto[] | undefined;
  upcoming: readonly DashboardPublicationDto[] | undefined;
  now: Date;
  timezone: string;
  onOpenPublication: (publicationId: string) => void;
  onNewPost: () => void;
};

const PENDING = new Set(['scheduled', 'queued', 'retry_wait']);

/** «через 2 ч 15 мин»; under a minute it says so instead of «через 0 мин». */
function countdown(iso: string, now: Date): string {
  return Date.parse(iso) - now.getTime() < 60_000 ? copy.next.now : `через ${untilShort(iso, now)}`;
}

function when(iso: string, now: Date, timezone: string): string {
  return `${otherDay(iso, now, timezone) ?? 'сегодня'}, ${formatClock(iso, timezone)}`;
}

/** The one publication that matters next: a live countdown, its post and channel, and the few after it. */
export function NextUp({ today, upcoming, now, timezone, onOpenPublication, onNewPost }: Props) {
  const loaded = today !== undefined && upcoming !== undefined;
  const next = loaded ? nextPublication(today, upcoming, now) : undefined;
  const following = loaded
    ? [...today, ...upcoming]
        .filter(
          (item) =>
            PENDING.has(item.status) &&
            Date.parse(item.scheduledAt) > now.getTime() &&
            item.publicationId !== next?.publicationId
        )
        .slice(0, FOLLOWING)
    : [];
  return (
    <Widget
      id="next"
      title={copy.next.title}
      busy={!loaded}
      action={
        <Link to="/publications" search={{ view: 'upcoming' }}>
          {copy.next.all}
          <Icon name="chevron-right" size={14} />
        </Link>
      }
    >
      <div className={`${shell.body} ${styles.layout}`}>
        {!loaded ? (
          <>
            <div className={styles.hero} aria-hidden="true">
              <Skeleton width="60%" height={40} />
              <Skeleton width="80%" height={18} />
              <Skeleton width="40%" height={14} />
            </div>
            <div className={styles.after} aria-hidden="true">
              <Skeleton height={14} />
              <Skeleton height={14} />
            </div>
          </>
        ) : !next ? (
          <div className={shell.emptyBlock}>
            <span className={styles.emptyMark} aria-hidden="true">
              <Icon name="clock" size={24} />
            </span>
            <p className={styles.emptyTitle}>{copy.next.empty}</p>
            <Button icon="plus" onPress={onNewPost}>
              {copy.next.create}
            </Button>
          </div>
        ) : (
          <>
            <AriaButton
              className={styles.hero}
              aria-label={copy.next.open(next.postTitle)}
              onPress={() => onOpenPublication(next.publicationId)}
            >
              <time className={styles.countdown} dateTime={next.scheduledAt}>
                {countdown(next.scheduledAt, now)}
              </time>
              <span className={styles.postTitle}>{next.postTitle}</span>
              <span className={styles.where}>
                <span className={shell.avatar} aria-hidden="true">
                  {avatarLetter(next.destinationName)}
                </span>
                <span className={shell.truncate}>{next.destinationName}</span>
                <span className={styles.when}>{when(next.scheduledAt, now, timezone)}</span>
              </span>
            </AriaButton>
            {following.length > 0 ? (
              <div className={styles.after}>
                <h3 className={styles.afterTitle}>{copy.next.after}</h3>
                <ul className={styles.afterList}>
                  {following.map((item) => (
                    <li key={item.publicationId}>
                      <AriaButton
                        className={styles.afterItem}
                        aria-label={copy.next.open(item.postTitle)}
                        onPress={() => onOpenPublication(item.publicationId)}
                      >
                        <span className={styles.afterTime}>
                          <strong>{formatClock(item.scheduledAt, timezone)}</strong>
                          <small>{otherDay(item.scheduledAt, now, timezone) ?? 'сегодня'}</small>
                        </span>
                        <span className={styles.afterText}>
                          <span className={shell.truncate}>{item.postTitle}</span>
                          <small className={shell.truncate}>{item.destinationName}</small>
                        </span>
                      </AriaButton>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        )}
      </div>
    </Widget>
  );
}
