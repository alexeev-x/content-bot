import type { DashboardPublicationDto } from '@alexeev/contracts';
import { Link } from '@tanstack/react-router';
import { formatClock } from '../../../shared/lib/clock';
import { Button, StatusBadge } from '../../../shared/ui';
import { Block } from './Block';
import { copy } from './copy';
import styles from './Dashboard.module.css';
import { Row, SkeletonRows } from './Row';

/** Rows the panel keeps while loading or empty. */
const TODAY_RESERVE = 3;

type Props = {
  /** Undefined while the dashboard loads: the panel shows skeleton rows in the same geometry. */
  items: readonly DashboardPublicationDto[] | undefined;
  total: number;
  /** «Europe/Chisinau, UTC+3»: shown once in the block header. */
  zoneNote: string;
  onSchedule: () => void;
};

/** Today's timeline, earliest first; sent rows stay with «Опубликовано» so the day reads as a whole. */
export function TodayBlock({ items, total, zoneNote, onSchedule }: Props) {
  return (
    <Block
      title={copy.today.title}
      note={zoneNote}
      reserveRows={TODAY_RESERVE}
      action={
        <Link to="/publications" search={{ view: 'today' }} className={styles.cardLink}>
          Все публикации
        </Link>
      }
    >
      {items === undefined ? (
        <SkeletonRows count={TODAY_RESERVE} />
      ) : items.length === 0 ? (
        <div className={styles.emptyLine}>
          <p>{copy.today.empty}</p>
          <Button size="sm" onPress={onSchedule}>
            {copy.today.schedule}
          </Button>
        </div>
      ) : (
        <>
          <ul className={styles.list}>
            {items.map((item) => (
              <Row
                key={item.publicationId}
                layout="inline"
                time={<time dateTime={item.scheduledAt}>{formatClock(item.scheduledAt)}</time>}
                title={item.postTitle}
                channel={item.destinationName}
                trail={<StatusBadge status={item.status} />}
                to="/publications"
                search={{ id: item.publicationId, view: 'today' }}
              />
            ))}
          </ul>
          {total > items.length ? (
            <Link to="/publications" search={{ view: 'today' }} className={styles.more}>
              {copy.today.showAll}
            </Link>
          ) : null}
        </>
      )}
    </Block>
  );
}
