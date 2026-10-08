import type { DashboardPublicationDto, DashboardSentDto } from '@alexeev/contracts';
import { Link } from '@tanstack/react-router';
import { formatDayClock } from '../../../shared/lib/clock';
import { StatusBadge } from '../../../shared/ui';
import { Block } from './Block';
import { copy } from './copy';
import styles from './Dashboard.module.css';
import { Row, SkeletonRows } from './Row';

/** Rows each list panel keeps while loading or empty. */
const LIST_RESERVE = 3;

/** The next publications after today. Always shown, so the page keeps one layout; «Сегодня» carries the call to action. */
export function UpcomingBlock({ items }: { items: readonly DashboardPublicationDto[] | undefined }) {
  return (
    <Block
      title={copy.upcoming.title}
      reserveRows={LIST_RESERVE}
      action={
        <Link to="/publications" search={{ view: 'upcoming' }} className={styles.cardLink}>
          Все публикации
        </Link>
      }
    >
      {items === undefined ? (
        <SkeletonRows count={LIST_RESERVE} />
      ) : items.length === 0 ? (
        <p className={styles.emptyLine}>{copy.upcoming.empty}</p>
      ) : (
        <ul className={styles.list}>
          {items.map((item) => (
            <Row
              key={item.publicationId}
              layout="stacked"
              time={<time dateTime={item.scheduledAt}>{formatDayClock(item.scheduledAt)}</time>}
              title={item.postTitle}
              channel={item.destinationName}
              trail={<StatusBadge status={item.status} />}
              to="/publications"
              search={{ id: item.publicationId, view: 'upcoming' }}
            />
          ))}
        </ul>
      )}
    </Block>
  );
}

/** The last sent publications; the Telegram link exists only when the server could build a public one. */
export function RecentSentBlock({ items }: { items: readonly DashboardSentDto[] | undefined }) {
  return (
    <Block
      title={copy.recent.title}
      reserveRows={LIST_RESERVE}
      action={
        <Link to="/publications" search={{ view: 'recent' }} className={styles.cardLink}>
          Все публикации
        </Link>
      }
    >
      {items === undefined ? (
        <SkeletonRows count={LIST_RESERVE} />
      ) : items.length === 0 ? (
        <p className={styles.emptyLine}>{copy.recent.empty}</p>
      ) : (
        <ul className={styles.list}>
          {items.map((item) => (
            <Row
              key={item.publicationId}
              layout="stacked"
              time={<time dateTime={item.sentAt}>{formatDayClock(item.sentAt)}</time>}
              title={item.postTitle}
              channel={item.destinationName}
              to="/publications"
              search={{ id: item.publicationId, view: 'recent' }}
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
      )}
    </Block>
  );
}
