import type { DashboardPublicationDto } from '@alexeev/contracts';
import { Link } from '@tanstack/react-router';
import { Button as AriaButton } from 'react-aria-components';
import { formatClock } from '../../../shared/lib/clock';
import { Button, EmptyState, Icon, Skeleton } from '../../../shared/ui';
import { nextPublication, otherDay, untilShort } from '../model/format';
import { avatarLetter } from '../model/tone';
import { copy } from './copy';
import shell from './Dashboard.module.css';
import styles from './NextUp.module.css';
import { Widget } from './Widget';

type Props = {
  today: readonly DashboardPublicationDto[] | undefined;
  upcoming: readonly DashboardPublicationDto[] | undefined;
  now: Date;
  timezone: string;
  onOpenPublication: (publicationId: string) => void;
  onNewPost: () => void;
};

/** «через 2 ч 15 мин»; under a minute it says so instead of «через 0 мин». */
function countdown(iso: string, now: Date): string {
  return Date.parse(iso) - now.getTime() < 60_000 ? copy.next.now : `через ${untilShort(iso, now)}`;
}

function when(iso: string, now: Date, timezone: string): string {
  return `${otherDay(iso, now, timezone) ?? 'сегодня'}, ${formatClock(iso, timezone)}`;
}

/** The one publication that matters next: a live countdown, its post and channel. */
export function NextUp({ today, upcoming, now, timezone, onOpenPublication, onNewPost }: Props) {
  const loaded = today !== undefined && upcoming !== undefined;
  const next = loaded ? nextPublication(today, upcoming, now) : undefined;
  return (
    <Widget
      id="nextPublication"
      title={copy.next.title}
      busy={!loaded}
      action={
        <Link to="/publications" search={{ view: 'upcoming' }}>
          {copy.next.all}
          <Icon name="chevron-right" size={14} />
        </Link>
      }
    >
      <div className={`${shell.body}`}>
        {!loaded ? (
          <>
            {/* The card's own gradient surface pulses; the placeholders only hold its height and stay invisible. */}
            <div className={`${styles.hero} ${styles.heroLoading}`} aria-hidden="true">
              <span className={styles.heroHold}>
                <Skeleton width="60%" height={40} />
                <Skeleton width="80%" height={18} />
                <Skeleton width="40%" height={14} />
              </span>
            </div>
          </>
        ) : !next ? (
          <EmptyState
            size="compact"
            icon="clock"
            title={copy.next.empty}
            action={
              <Button size="sm" icon="plus" onPress={onNewPost}>
                {copy.next.create}
              </Button>
            }
          />
        ) : (
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
        )}
      </div>
    </Widget>
  );
}
