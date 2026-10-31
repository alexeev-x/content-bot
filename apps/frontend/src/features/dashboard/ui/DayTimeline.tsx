import {
  type ActivityItemDto,
  type DashboardDto,
  type DashboardPublicationDto,
  RUBRIC_TITLES,
  rubricSlotReason
} from '@alexeev/contracts';
import { Link, useNavigate } from '@tanstack/react-router';
import type { CSSProperties } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import { formatClock } from '../../../shared/lib/clock';
import {
  Button,
  EmptyState,
  Icon,
  type IconName,
  Skeleton,
  statusMeta,
  type StatusGroup,
  Tooltip
} from '../../../shared/ui';
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

type RubricSlot = NonNullable<DashboardDto['rubricSlots']>[number];
type Entry =
  | { kind: 'publication'; scheduledAt: string; item: DashboardPublicationDto }
  | { kind: 'slot'; scheduledAt: string; slot: RubricSlot };

/** A rubric slot's tone on the line: being prepared, out, not out, or set aside. */
function slotTone(state: RubricSlot['state']): { group: StatusGroup; icon: IconName } {
  switch (state) {
    case 'planned':
      return { group: 'pending', icon: 'clock' };
    case 'building':
    case 'ready':
    case 'released':
    case 'waiting_parent':
      return { group: 'active', icon: 'loader' };
    case 'unknown':
    case 'unresolved':
      return { group: 'unknown', icon: 'help' };
    case 'sent':
      return { group: 'done', icon: 'check-circle' };
    case 'partial':
      return { group: 'retry', icon: 'retry' };
    case 'send_failed':
    case 'missed':
    case 'empty':
      return { group: 'failed', icon: 'x-circle' };
    default:
      return { group: 'muted', icon: 'minus-circle' };
  }
}

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
  /** The day's rubric slots that are not a publication (yet): being prepared, or not out and why. */
  rubricSlots?: DashboardDto['rubricSlots'];
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
  onOpenActivity,
  rubricSlots
}: Props) {
  const navigate = useNavigate();
  const eventGroups = groupByTime(
    (events ?? [])
      .filter((event) => event.action !== 'job.succeeded')
      .map((event) => ({ event, percent: dayPercent(event.at, day) })),
    phone ? EVENT_GAP_PHONE : EVENT_GAP_DESKTOP
  );
  const entries: Entry[] = items
    ? [
        ...items.map((item) => ({ kind: 'publication' as const, scheduledAt: item.scheduledAt, item })),
        ...(rubricSlots ?? []).map((slot) => ({ kind: 'slot' as const, scheduledAt: slot.at, slot }))
      ]
    : [];
  const markers = placeMarkers(entries, day, phone ? GAP_PHONE : GAP_DESKTOP, LANES);
  const nowPercent = dayPercent(now.getTime(), day);
  const empty = items !== undefined && items.length === 0 && (rubricSlots ?? []).length === 0;
  const showEvents = onOpenActivity !== undefined;
  const sent = items?.filter((item) => item.status === 'sent').length ?? 0;
  // A rubric slot that ended without going out is a problem of the day too.
  const problems =
    (items?.filter((item) => item.status === 'failed' || item.status === 'unknown').length ?? 0) +
    (rubricSlots ?? []).filter((slot) => slotTone(slot.state).group === 'failed').length;
  const eventCount = eventGroups.reduce((sum, group) => sum + group.length, 0);
  // A day with nothing planned and nothing logged: one calm state instead of an empty scale.
  const quiet = empty && (!showEvents || eventCount === 0);
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
        {quiet ? (
          <EmptyState
            size="compact"
            icon="calendar"
            title={copy.line.empty}
            action={
              <Button size="sm" variant="secondary" icon="plus" onPress={onNewPost}>
                {copy.line.schedule}
              </Button>
            }
          />
        ) : (
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
                  {markers.map(({ item: entry, percent, lane }) => {
                    if (entry.kind === 'slot') {
                      const { slot } = entry;
                      const tone = slotTone(slot.state);
                      const clock = formatClock(slot.at, timezone);
                      const reason = rubricSlotReason(slot.code);
                      const status = copy.line.slotStatus(copy.line.slotStates[slot.state], reason);
                      const title = RUBRIC_TITLES[slot.rubricKey];
                      return (
                        <li
                          key={slot.slotId}
                          className={styles.markerSlot}
                          data-lane={lane}
                          style={
                            {
                              insetInlineStart: percent + '%',
                              '--lane': lane,
                              ...toneStyle(tone.group)
                            } as CSSProperties
                          }
                        >
                          <Tooltip
                            content={
                              <span className={styles.tip}>
                                <strong>{copy.line.rubric(title)}</strong>
                                <span>
                                  {clock} · {status}
                                </span>
                              </span>
                            }
                          >
                            <AriaButton
                              className={styles.marker}
                              data-rubric="slot"
                              aria-label={copy.line.slotMarker(title, clock, status)}
                              onPress={() => void navigate({ to: '/rubrics' })}
                            >
                              {phone ? (
                                <Icon name={tone.icon} size={16} />
                              ) : (
                                <>
                                  <span className={styles.letter}>{copy.line.rubricLetter}</span>
                                  <span className={styles.badge}>
                                    <Icon name={tone.icon} size={10} />
                                  </span>
                                </>
                              )}
                            </AriaButton>
                          </Tooltip>
                        </li>
                      );
                    }
                    const { item } = entry;
                    const meta = statusMeta(item.status);
                    const clock = formatClock(item.scheduledAt, timezone);
                    const byAi = item.postOrigin ? copy.line.byAi(meta.label, item.postOrigin.source) : meta.label;
                    const rubric = item.rubricKey == null ? null : RUBRIC_TITLES[item.rubricKey];
                    const status = rubric === null ? byAi : copy.line.rubric(rubric) + ' · ' + byAi;
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
                                {clock} · {status}
                              </span>
                            </span>
                          }
                        >
                          <AriaButton
                            className={styles.marker}
                            data-rubric={rubric === null ? undefined : 'post'}
                            aria-label={copy.line.marker(item.postTitle, item.destinationName, clock, status)}
                            onPress={() => onOpenPublication(item.publicationId)}
                          >
                            {phone ? (
                              <Icon name={meta.icon} size={16} />
                            ) : (
                              <>
                                <span className={styles.letter}>
                                  {rubric === null ? avatarLetter(item.destinationName) : copy.line.rubricLetter}
                                </span>
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
                                    {event.actor === 'autopublish' || event.actor === 'ai'
                                      ? ` · ${copy.activity.aiShort}`
                                      : ''}
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
        )}
        {items ? <p className={styles.sr}>{copy.line.summary(total)}</p> : null}
        {quiet ? null : empty ? (
          <div className={styles.hint}>
            <p className={styles.hintText}>{copy.line.empty}</p>
            <Button size="sm" variant="secondary" icon="plus" onPress={onNewPost}>
              {copy.line.schedule}
            </Button>
          </div>
        ) : items ? (
          <ul className={styles.stats} aria-label={copy.line.statsLabel}>
            {total > 0 ? (
              <li className={styles.stat}>
                <strong>{total}</strong> {copy.line.statPublications(total)}
              </li>
            ) : null}
            {sent > 0 ? (
              <li className={styles.stat} style={toneStyle('done')} data-tone="done">
                <strong>{sent}</strong> {copy.line.statSent}
              </li>
            ) : null}
            {problems > 0 ? (
              <li className={styles.stat} style={toneStyle('failed')} data-tone="failed">
                <strong>{problems}</strong> {copy.line.statProblems(problems)}
              </li>
            ) : null}
            {showEvents && eventCount > 0 ? (
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
