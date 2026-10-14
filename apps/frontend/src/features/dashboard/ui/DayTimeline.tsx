import type { ActivityItemDto, DashboardPublicationDto } from '@alexeev/contracts';
import { Link } from '@tanstack/react-router';
import type { CSSProperties } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import { formatClock } from '../../../shared/lib/clock';
import { Button, Icon, Skeleton, statusMeta, Tooltip } from '../../../shared/ui';
import { activityView, groupByTime } from '../model/activity-view';
import { dayPercent, placeMarkers } from '../model/timeline';
import { avatarLetter, toneStyle } from '../model/tone';
import { copy } from './copy';
import shell from './Dashboard.module.css';
import styles from './DayTimeline.module.css';
import { Widget } from './Widget';

const LANES = 2;
// Minimum distance between two markers of one lane, in percent of the day: a marker is 28 px on a ~300 px (phone) or ~1000 px track.
const GAP_PHONE = 11;
const GAP_DESKTOP = 3.5;
const HOURS = [0, 3, 6, 9, 12, 15, 18, 21, 24];

type Props = {
  items: readonly DashboardPublicationDto[] | undefined;
  total: number;
  day: { from: string; to: string };
  now: Date;
  timezone: string;
  phone: boolean;
  onOpenPublication: (publicationId: string) => void;
  onNewPost: () => void;
  /** The day's studio events for the second lane; undefined while loading. Sends already show as markers. */
  events?: readonly ActivityItemDto[] | undefined;
  onOpenActivity?: (items: readonly ActivityItemDto[]) => void;
};

// Events closer than one dot width (percent of the day) share a dot: ~1.5 h on desktop, ~3 h on a phone.
const EVENT_GAP_DESKTOP = 6;
const EVENT_GAP_PHONE = 12;

/** The day as a 00-24 line in the owner's zone: one marker per publication, a «сейчас» line, tooltips on hover and focus. */
export function DayTimeline({
  items,
  total,
  day,
  now,
  timezone,
  phone,
  onOpenPublication,
  onNewPost,
  events,
  onOpenActivity
}: Props) {
  const eventGroups = groupByTime(
    (events ?? [])
      .filter((event) => event.action !== 'job.succeeded')
      .map((event) => ({ event, percent: dayPercent(event.at, day) })),
    phone ? EVENT_GAP_PHONE : EVENT_GAP_DESKTOP
  );
  const markers = items ? placeMarkers(items, day, phone ? GAP_PHONE : GAP_DESKTOP, LANES) : [];
  const nowPercent = dayPercent(now.getTime(), day);
  const empty = items !== undefined && items.length === 0;
  return (
    <Widget
      id="line"
      title={copy.line.title}
      busy={items === undefined}
      action={
        <Link to="/publications" search={{ from: day.from, to: day.to }}>
          {copy.line.all}
          <Icon name="chevron-right" size={14} />
        </Link>
      }
    >
      <div className={shell.body}>
        <div className={styles.chart} style={{ '--lanes': LANES, '--now': `${nowPercent}%` } as CSSProperties}>
          <div className={styles.plot}>
            <span className={styles.track} aria-hidden="true" />
            <span className={styles.past} aria-hidden="true" />
            {HOURS.map((hour) => (
              <span
                key={hour}
                className={styles.tick}
                data-minor={hour % 6 !== 0 || undefined}
                style={{ insetInlineStart: `${(hour / 24) * 100}%` }}
                aria-hidden="true"
              >
                <span className={styles.tickLabel}>{String(hour).padStart(2, '0')}</span>
              </span>
            ))}
            <span className={styles.now} aria-hidden="true">
              <span className={styles.nowLabel}>{formatClock(now.toISOString(), timezone)}</span>
            </span>
            {items === undefined ? (
              <span className={styles.skeletonDots} aria-hidden="true">
                <Skeleton width={28} height={28} radius="var(--radius-pill)" />
                <Skeleton width={28} height={28} radius="var(--radius-pill)" />
                <Skeleton width={28} height={28} radius="var(--radius-pill)" />
              </span>
            ) : (
              <ul className={styles.markers} aria-label={copy.line.title}>
                {markers.map(({ item, percent, lane }) => {
                  const meta = statusMeta(item.status);
                  const clock = formatClock(item.scheduledAt, timezone);
                  return (
                    <li
                      key={item.publicationId}
                      className={styles.markerSlot}
                      data-lane={lane}
                      style={
                        { insetInlineStart: `${percent}%`, '--lane': lane, ...toneStyle(meta.group) } as CSSProperties
                      }
                    >
                      <Tooltip
                        content={
                          <span className={styles.tip}>
                            <strong>{item.postTitle}</strong>
                            <span>{item.destinationName}</span>
                            <span>
                              {clock} · {meta.label}
                            </span>
                          </span>
                        }
                      >
                        <AriaButton
                          className={styles.marker}
                          aria-label={copy.line.marker(item.postTitle, item.destinationName, clock, meta.label)}
                          onPress={() => onOpenPublication(item.publicationId)}
                        >
                          {phone ? (
                            <Icon name={meta.icon} size={16} />
                          ) : (
                            <>
                              <span className={styles.letter}>{avatarLetter(item.destinationName)}</span>
                              <span className={styles.badge}>
                                <Icon name={meta.icon} size={10} />
                              </span>
                            </>
                          )}
                        </AriaButton>
                      </Tooltip>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
        {onOpenActivity && eventGroups.length > 0 ? (
          <div className={styles.eventsRow}>
            <span className={styles.eventsLabel}>{copy.activity.lane}</span>
            <ul className={styles.events} aria-label={copy.activity.lane}>
              {eventGroups.map((group) => {
                const first = group[group.length - 1]?.event;
                if (!first) return null;
                const view = activityView(first);
                const clock = formatClock(first.at, timezone);
                return (
                  <li
                    key={first.id}
                    className={styles.eventSlot}
                    style={{ insetInlineStart: `${group[0]?.percent ?? 0}%` }}
                  >
                    <AriaButton
                      className={styles.eventDot}
                      style={toneStyle(view.tone)}
                      aria-label={copy.activity.eventDot(group.length, view.text, clock)}
                      onPress={() => onOpenActivity(group.map((point) => point.event).reverse())}
                    >
                      <Icon name={view.icon} size={12} />
                      {group.length > 1 ? <span className={styles.eventCount}>{group.length}</span> : null}
                    </AriaButton>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
        {items ? <p className={styles.sr}>{copy.line.summary(total)}</p> : null}
        {empty ? (
          <div className={styles.hint}>
            <p className={styles.hintText}>{copy.line.empty}</p>
            <Button size="sm" variant="secondary" icon="plus" onPress={onNewPost}>
              {copy.line.schedule}
            </Button>
          </div>
        ) : items ? (
          <p className={styles.partial}>
            {copy.line.stat(total, items.filter((item) => item.status === 'sent').length)}
            {total > items.length ? ` · ${copy.line.more(items.length, total)}` : ''}
          </p>
        ) : (
          <span className={styles.hintSpacer} />
        )}
      </div>
    </Widget>
  );
}
