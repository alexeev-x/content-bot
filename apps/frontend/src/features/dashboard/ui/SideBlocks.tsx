import type { DashboardPublicationDto, DashboardSentDto } from '@alexeev/contracts';
import { formatDayClock } from '../../../shared/lib/clock';
import { StatusBadge } from '../../../shared/ui';
import { Block } from './Block';
import { copy } from './copy';
import styles from './Dashboard.module.css';
import { Row } from './Row';

/** The next publications after today. Shown only when there are some: «Сегодня» carries the call to action. */
export function UpcomingBlock({ items }: { items: readonly DashboardPublicationDto[] }) {
  if (items.length === 0) return null;
  return (
    <Block title={copy.upcoming.title}>
      <ul className={styles.list}>
        {items.map((item) => (
          <Row
            key={item.publicationId}
            layout="stacked"
            time={<time dateTime={item.scheduledAt}>{formatDayClock(item.scheduledAt)}</time>}
            title={item.postTitle}
            channel={item.destinationName}
            trail={<StatusBadge status={item.status} />}
          />
        ))}
      </ul>
    </Block>
  );
}

/** The last sent publications; the Telegram link exists only when the server could build a public one. */
export function RecentSentBlock({ items }: { items: readonly DashboardSentDto[] }) {
  if (items.length === 0) return null;
  return (
    <Block title={copy.recent.title}>
      <ul className={styles.list}>
        {items.map((item) => (
          <Row
            key={item.publicationId}
            layout="stacked"
            time={<time dateTime={item.sentAt}>{formatDayClock(item.sentAt)}</time>}
            title={item.postTitle}
            channel={item.destinationName}
            trail={
              item.messageUrl ? (
                <a
                  className={styles.external}
                  href={item.messageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${copy.recent.openInTelegram}: «${item.postTitle}»`}
                >
                  {copy.recent.openInTelegram}
                </a>
              ) : null
            }
          />
        ))}
      </ul>
    </Block>
  );
}
