import type { DashboardSentDto } from '@alexeev/contracts';
import { Link } from '@tanstack/react-router';
import { Button as AriaButton } from 'react-aria-components';
import { Icon, Skeleton } from '../../../shared/ui';
import { formatClock } from '../../../shared/lib/clock';
import { recentTime } from '../model/format';
import { copy } from './copy';
import shell from './Dashboard.module.css';
import styles from './RecentBubbles.module.css';
import { Widget } from './Widget';

const SHOWN_DESKTOP = 4;
const SHOWN_PHONE = 3;

type Props = {
  items: readonly DashboardSentDto[] | undefined;
  now: Date;
  timezone: string;
  phone: boolean;
  onOpenPublication: (publicationId: string) => void;
};

/** The last confirmed sends as small Telegram-style messages: title, channel, time, and the real message when it has a public link. */
export function RecentBubbles({ items, now, timezone, phone, onOpenPublication }: Props) {
  const shown = items?.slice(0, phone ? SHOWN_PHONE : SHOWN_DESKTOP);
  return (
    <Widget
      id="recent"
      title={copy.recent.title}
      busy={items === undefined}
      action={
        <Link to="/publications" search={{ view: 'recent' }}>
          {copy.recent.all}
          <Icon name="chevron-right" size={14} />
        </Link>
      }
    >
      <div className={shell.body}>
        <div className={styles.chat}>
          {shown === undefined ? (
            <div className={styles.skeleton} aria-hidden="true">
              <Skeleton height={64} radius="var(--radius-3)" />
              <Skeleton height={64} radius="var(--radius-3)" />
            </div>
          ) : shown.length === 0 ? (
            <p className={styles.empty}>{copy.recent.empty}</p>
          ) : (
            <ul className={styles.list}>
              {shown.map((item) => (
                <li key={item.publicationId} className={styles.bubble}>
                  <AriaButton
                    className={styles.main}
                    aria-label={copy.recent.open(item.postTitle)}
                    onPress={() => onOpenPublication(item.publicationId)}
                  >
                    <span className={styles.channel}>{item.destinationName}</span>
                    <span className={styles.title}>{item.postTitle}</span>
                  </AriaButton>
                  <span className={styles.foot}>
                    {item.messageUrl ? (
                      <a
                        className={styles.link}
                        href={item.messageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={copy.recent.telegram(item.postTitle)}
                      >
                        {copy.recent.openInTelegram}
                        <Icon name="external" size={12} />
                      </a>
                    ) : (
                      <span />
                    )}
                    <time dateTime={item.sentAt} title={formatClock(item.sentAt, timezone)}>
                      {recentTime(item.sentAt, now, timezone)}
                      <Icon name="check" size={12} />
                    </time>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Widget>
  );
}
