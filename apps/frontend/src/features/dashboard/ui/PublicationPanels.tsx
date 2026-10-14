import type { DashboardPublicationDto, DashboardSentDto } from '@alexeev/contracts';
import { Link } from '@tanstack/react-router';
import { formatClock, formatDayClock } from '../../../shared/lib/clock';
import { Button, Icon, PanelList, PanelRow, RowCard, StatusBadge, VisuallyHidden } from '../../../shared/ui';
import { fullTime, recentTime, untilShort } from '../model/format';
import { copy } from './copy';
import styles from './Dashboard.module.css';
import { EmptyLine, PanelLink, RowTile, Section, SkeletonRows, TableSkeleton, TimeCell } from './DashboardPanel';

type Open = (publicationId: string) => void;

function PhoneMeta({ status, text }: { status: DashboardPublicationDto['status']; text: string }) {
  return (
    <span className={styles.phoneMeta}>
      <StatusBadge status={status} />
      <span>{text}</span>
    </span>
  );
}

function TitleLink({
  item
}: {
  item: Pick<DashboardPublicationDto, 'publicationId' | 'postTitle' | 'destinationName'>;
}) {
  return (
    <div className={styles.titleBlock}>
      <Link
        to="/publications"
        search={{ id: item.publicationId }}
        className={styles.rowMain}
        title={`${item.postTitle} · ${item.destinationName}`}
      >
        {item.postTitle}
      </Link>
    </div>
  );
}

type TodayProps = {
  items: readonly DashboardPublicationDto[] | undefined;
  /** Server count of the day (capped at 100); the list shows only the first rows. */
  total: number;
  narrow: boolean;
  /** Rows that fit the widget (the grid height); without it the phone and desktop defaults apply. */
  capacity?: number;
  now: Date;
  timezone?: string;
  onOpenPublication: Open;
  onNewPost: () => void;
};

/** Today's timeline, earliest first. A sent row says «Опубликовано» only because the server said `sent`. */
export function TodayPanel({
  items,
  total,
  narrow,
  capacity,
  now,
  timezone = 'Europe/Moscow',
  onOpenPublication,
  onNewPost
}: TodayProps) {
  const reserve = capacity ?? (narrow ? 2 : 4);
  const shown = items?.slice(0, reserve);
  return (
    <Section
      area="today"
      title={copy.today.title}
      {...(items ? { count: total >= 100 ? '100+' : String(total) } : {})}
      action={<PanelLink search={{}} text={copy.today.all} />}
      rows={reserve}
      busy={items === undefined}
    >
      {shown === undefined ? (
        <SkeletonRows count={reserve} />
      ) : shown.length === 0 ? (
        <EmptyLine
          text={copy.today.empty}
          action={
            <Button size="sm" variant="ghost" icon="plus" onPress={onNewPost}>
              {copy.newPost}
            </Button>
          }
        />
      ) : (
        <PanelList aria-label={copy.today.title}>
          {shown.map((item) =>
            narrow ? (
              <RowCard
                key={item.publicationId}
                title={item.postTitle}
                media={<RowTile size={44} />}
                meta={
                  <PhoneMeta
                    status={item.status}
                    text={`${formatClock(item.scheduledAt, timezone)} · ${item.destinationName}`}
                  />
                }
                {...(item.status === 'unknown' ? { warning: copy.attention.unknownTag } : {})}
                onPress={() => onOpenPublication(item.publicationId)}
              />
            ) : (
              <PanelRow key={item.publicationId}>
                <TimeCell iso={item.scheduledAt} now={now} timezone={timezone} />
                <RowTile />
                <TitleLink item={item} />
                <span className={styles.statusCol}>
                  <StatusBadge status={item.status} />
                </span>
              </PanelRow>
            )
          )}
        </PanelList>
      )}
    </Section>
  );
}

type UpcomingProps = {
  items: readonly DashboardPublicationDto[] | undefined;
  narrow: boolean;
  capacity?: number;
  now: Date;
  timezone?: string;
  onOpenPublication: Open;
  onCreate: () => void;
};

/** The next publications after today, with the time left. */
export function UpcomingPanel({
  items,
  narrow,
  capacity,
  now,
  timezone = 'Europe/Moscow',
  onOpenPublication,
  onCreate
}: UpcomingProps) {
  const reserve = capacity ?? (narrow ? 2 : 4);
  const shown = items?.slice(0, reserve);
  return (
    <Section
      area="upcoming"
      title={copy.upcoming.title}
      action={<PanelLink search={{ view: 'upcoming' }} text={narrow ? copy.upcoming.allShort : copy.upcoming.all} />}
      rows={reserve}
      busy={items === undefined}
    >
      {shown === undefined ? (
        <SkeletonRows count={reserve} />
      ) : shown.length === 0 ? (
        <EmptyLine
          text={copy.upcoming.empty}
          action={
            <Button size="sm" variant="ghost" onPress={onCreate}>
              {copy.upcoming.create}
            </Button>
          }
        />
      ) : (
        <PanelList aria-label={copy.upcoming.title}>
          {shown.map((item) =>
            narrow ? (
              <RowCard
                key={item.publicationId}
                title={item.postTitle}
                media={<RowTile size={44} />}
                meta={
                  <PhoneMeta
                    status={item.status}
                    text={`${formatDayClock(item.scheduledAt, timezone)} · ${item.destinationName}`}
                  />
                }
                onPress={() => onOpenPublication(item.publicationId)}
              />
            ) : (
              <PanelRow key={item.publicationId}>
                <TimeCell iso={item.scheduledAt} now={now} withDay timezone={timezone} />
                <RowTile />
                <TitleLink item={item} />
                <span className={styles.until}>{untilShort(item.scheduledAt, now)}</span>
              </PanelRow>
            )
          )}
        </PanelList>
      )}
    </Section>
  );
}

/** Pinned under the list so a short list does not end in a blank area. */
function RecentFooter() {
  return (
    <Link to="/publications" search={{ view: 'recent' }} className={styles.recentFooter}>
      {copy.recent.allFooter}
      <Icon name="chevron-right" size={14} />
    </Link>
  );
}

type RecentProps = {
  items: readonly DashboardSentDto[] | undefined;
  narrow: boolean;
  capacity?: number;
  now: Date;
  timezone?: string;
  onOpenPublication: Open;
};

/** The last sent publications; the Telegram link exists only when the server could build a public one. */
export function RecentPanel({
  items,
  narrow,
  capacity,
  now,
  timezone = 'Europe/Moscow',
  onOpenPublication
}: RecentProps) {
  const reserve = capacity ?? (narrow ? 2 : 5);
  const shown = items?.slice(0, reserve);
  return (
    <Section area="recent" title={copy.recent.title} rows={reserve} busy={items === undefined}>
      {shown === undefined ? (
        narrow ? (
          <SkeletonRows count={reserve} />
        ) : (
          <TableSkeleton rows={reserve} footer />
        )
      ) : shown.length === 0 ? (
        <EmptyLine text={copy.recent.empty} />
      ) : narrow ? (
        <>
          <PanelList aria-label={copy.recent.title}>
            {shown.map((item) => (
              <RowCard
                key={item.publicationId}
                title={item.postTitle}
                media={<RowTile size={44} />}
                meta={<PhoneMeta status={item.status} text={recentTime(item.sentAt, now, timezone)} />}
                onPress={() => onOpenPublication(item.publicationId)}
              />
            ))}
          </PanelList>
          <RecentFooter />
        </>
      ) : (
        <>
          <table className={styles.recent} aria-label={copy.recent.title}>
            <thead>
              <tr>
                <th scope="col">{copy.recent.time}</th>
                <th scope="col">{copy.recent.post}</th>
                <th scope="col">{copy.recent.status}</th>
                <th scope="col" className={styles.num}>
                  {copy.recent.link}
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((item) => (
                <tr key={item.publicationId}>
                  <td className={styles.mono}>
                    <time dateTime={item.sentAt} title={fullTime(item.sentAt, timezone)}>
                      {recentTime(item.sentAt, now, timezone)}
                      <VisuallyHidden>{`, ${fullTime(item.sentAt, timezone)}`}</VisuallyHidden>
                    </time>
                  </td>
                  <td>
                    <span className={styles.recentTitle}>
                      <RowTile size={32} />
                      <Link
                        to="/publications"
                        search={{ id: item.publicationId }}
                        className={styles.rowMain}
                        title={`${item.postTitle} · ${item.destinationName}`}
                      >
                        {item.postTitle}
                      </Link>
                    </span>
                  </td>
                  <td>
                    <StatusBadge status={item.status} />
                  </td>
                  <td className={styles.num}>
                    {item.messageUrl ? (
                      <a
                        className={styles.external}
                        href={item.messageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`${copy.recent.openInTelegram}: «${item.postTitle}»`}
                      >
                        {copy.recent.openInTelegram}
                      </a>
                    ) : (
                      <span className={styles.mono} title={copy.noData}>
                        —
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <RecentFooter />
        </>
      )}
    </Section>
  );
}
