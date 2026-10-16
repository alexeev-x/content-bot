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
  const showEvents = onOpenActivity !== undefined;
  const sent = items?.filter((item) => item.status === 'sent').length ?? 0;
  const problems = items?.filter((item) => item.status === 'failed' || item.status === 'unknown').length ?? 0;
  const eventCount = eventGroups.reduce((sum, group) => sum + group.length, 0);
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
        <div
          className={styles.chart}
          data-events={showEvents || undefined}
          style={{ '--lanes': LANES, '--now': `${nowPercent}%` } as CSSProperties}
        >
          {phone ? null : (
            <div className={styles.labels} aria-hidden="true">
              <span className={styles.labelPub}>{copy.line.lanePublications}</span>
              {showEvents ? <span className={styles.labelEvents}>{copy.activity.lane}</span> : null}
            </div>
          )}
          <div className={styles.plot}>
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
            <span className={styles.past} aria-hidden="true" />
            <span className={styles.track} aria-hidden="true" />
            <span className={styles.trackDone} aria-hidden="true" />
            {showEvents ? <span className={styles.eventsTrack} aria-hidden="true" /> : null}
            <span className={styles.now} aria-hidden="true">
              <span className={styles.nowLabel}>{formatClock(now.toISOString(), timezone)}</span>
            </span>
            {/* While loading, the scale stays empty: placeholder dots sat where no publication was and jumped away. */}
            {items === undefined ? null : (
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
            {showEvents ? (
              <ul className={styles.events} aria-label={copy.activity.lane}>
                {eventGroups.map((group) => {
                  // The dot shows the most serious event of its group (an error before a routine edit).
                  const events = group.map((point) => point.event);
                  const lead = events.find((event) => event.category === 'errors') ?? events[events.length - 1];
                  if (!lead) return null;
                  const view = activityView(lead);
                  const clock = formatClock(lead.at, timezone);
                  return (
                    <li
                      key={lead.id}
                      className={styles.eventSlot}
                      style={
                        { insetInlineStart: `${group[0]?.percent ?? 0}%`, ...toneStyle(view.tone) } as CSSProperties
                      }
                    >
                      <Tooltip
                        content={
                          <span className={styles.tip}>
                            {events
                              .slice(-3)
                              .reverse()
                              .map((event) => (
                                <span key={event.id}>
                                  {formatClock(event.at, timezone)} · {activityView(event).text}
                                </span>
                              ))}
                            {events.length > 3 ? <span>{copy.activity.andMore(events.length - 3)}</span> : null}
                          </span>
                        }
                      >
                        <AriaButton
                          className={styles.eventDot}
                          aria-label={copy.activity.eventDot(group.length, view.text, clock)}
                          onPress={() => onOpenActivity([...events].reverse())}
                        >
                          <Icon name={view.icon} size={12} />
                          {group.length > 1 ? <span className={styles.eventCount}>{group.length}</span> : null}
                        </AriaButton>
                      </Tooltip>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
        </div>
        {items ? <p className={styles.sr}>{copy.line.summary(total)}</p> : null}
        {empty ? (
          <div className={styles.hint}>
            <p className={styles.hintText}>{copy.line.empty}</p>
            <Button size="sm" variant="secondary" icon="plus" onPress={onNewPost}>
              {copy.line.schedule}
            </Button>
          </div>
        ) : items ? (
          <ul className={styles.stats} aria-label={copy.line.statsLabel}>
            <li className={styles.stat}>
              <strong>{total}</strong> {copy.line.statPublications(total)}
            </li>
            <li className={styles.stat} style={toneStyle('done')} data-tone="done">
              <strong>{sent}</strong> {copy.line.statSent}
            </li>
            {problems > 0 ? (
              <li className={styles.stat} style={toneStyle('failed')} data-tone="failed">
                <strong>{problems}</strong> {copy.line.statProblems(problems)}
              </li>
            ) : null}
            {showEvents ? (
              <li className={styles.stat}>
                <strong>{eventCount}</strong> {copy.line.statEvents(eventCount)}
              </li>
            ) : null}
            {total > items.length ? <li className={styles.statNote}>{copy.line.more(items.length, total)}</li> : null}
          </ul>
        ) : (
          <ul className={styles.stats} aria-hidden="true">
            <li className={styles.stat}>
              <strong>
                <Skeleton width={72} height="1lh" />
              </strong>
            </li>
          </ul>
        )}
      </div>
    </Widget>
  );
}
