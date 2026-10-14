import type { ActivityItemDto, DashboardPublicationDto } from '@alexeev/contracts';
import type { CSSProperties } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import { formatClock } from '../../../shared/lib/clock';
import { Icon, statusMeta, Tooltip } from '../../../shared/ui';
import { activityView } from '../model/activity-view';
import { untilShort } from '../model/format';
import { dayPercent } from '../model/timeline';
import { avatarLetter, toneStyle } from '../model/tone';
import styles from './DayViews.module.css';

// Design trial (owner, 14.10.2026): alternative looks for «Лента дня», switchable on DEV only. The owner picks one;
// the others are then deleted.

export type DayView = 'lanes' | 'schedule' | 'focus' | 'heat' | 'urgency' | 'channels' | 'clock';

export const DAY_VIEWS: readonly { id: DayView; label: string }[] = [
  { id: 'lanes', label: 'А. Шкала с дорожками' },
  { id: 'schedule', label: 'Б. Расписание' },
  { id: 'focus', label: 'В. Сейчас, до и после' },
  { id: 'heat', label: 'Г. Часы-ячейки' },
  { id: 'urgency', label: 'Е. Что впереди' },
  { id: 'channels', label: 'Ж. По каналам' },
  { id: 'clock', label: 'З. Циферблат' }
];

export type DayViewProps = {
  items: readonly DashboardPublicationDto[];
  events: readonly ActivityItemDto[];
  day: { from: string; to: string };
  now: Date;
  timezone: string;
  onOpenPublication: (publicationId: string) => void;
  onOpenActivity: (items: readonly ActivityItemDto[]) => void;
  onOpenRange: (range: { from: string; to: string }) => void;
};

const byTime = (a: { at: string }, b: { at: string }) => a.at.localeCompare(b.at);
const isAhead = (item: DashboardPublicationDto, now: Date) =>
  item.status !== 'sent' &&
  item.status !== 'failed' &&
  item.status !== 'cancelled' &&
  Date.parse(item.scheduledAt) >= now.getTime() - 60_000;

function PublicationChip({
  item,
  timezone,
  onOpen
}: {
  item: DashboardPublicationDto;
  timezone: string;
  onOpen: () => void;
}) {
  const meta = statusMeta(item.status);
  return (
    <AriaButton className={styles.pub} style={toneStyle(meta.group)} onPress={onOpen}>
      <span className={styles.pubTime}>{formatClock(item.scheduledAt, timezone)}</span>
      <span className={styles.pubText}>
        <span className={styles.pubTitle}>{item.postTitle}</span>
        <span className={styles.pubMeta}>
          {item.destinationName} · <Icon name={meta.icon} size={12} /> {meta.label}
        </span>
      </span>
    </AriaButton>
  );
}

/** Б. A calendar-like day: publications as cards, studio events as small lines, a «сейчас» divider in place. */
export function ScheduleView({ items, events, now, timezone, onOpenPublication, onOpenActivity }: DayViewProps) {
  type Row =
    { at: string; kind: 'pub'; item: DashboardPublicationDto } | { at: string; kind: 'event'; event: ActivityItemDto };
  const rows: Row[] = [
    ...items.map((item) => ({ at: item.scheduledAt, kind: 'pub' as const, item })),
    ...events
      .filter((event) => event.action !== 'job.succeeded')
      .map((event) => ({ at: event.at, kind: 'event' as const, event }))
  ].sort(byTime);
  const nowIso = now.toISOString();
  const nowIndex = rows.findIndex((row) => row.at > nowIso);
  return (
    <ol className={styles.schedule}>
      {rows.map((row, index) => (
        <li key={row.kind === 'pub' ? row.item.publicationId : row.event.id} className={styles.scheduleRow}>
          {nowIndex === index ? (
            <span className={styles.nowDivider}>
              <span>{formatClock(nowIso, timezone)} · сейчас</span>
            </span>
          ) : null}
          {row.kind === 'pub' ? (
            <PublicationChip
              item={row.item}
              timezone={timezone}
              onOpen={() => onOpenPublication(row.item.publicationId)}
            />
          ) : (
            <AriaButton
              className={styles.eventLine}
              style={toneStyle(activityView(row.event).tone)}
              onPress={() => onOpenActivity([row.event])}
            >
              <span className={styles.eventTime}>{formatClock(row.event.at, timezone)}</span>
              <Icon name={activityView(row.event).icon} size={12} />
              <span className={styles.eventText}>
                {activityView(row.event).text}
                {row.event.title ? ` · ${row.event.title}` : ''}
              </span>
            </AriaButton>
          )}
        </li>
      ))}
      {nowIndex === -1 ? (
        <li className={styles.scheduleRow}>
          <span className={styles.nowDivider}>
            <span>{formatClock(nowIso, timezone)} · сейчас</span>
          </span>
        </li>
      ) : null}
    </ol>
  );
}

/** В. What already went, the next one large, what comes later; a thin day strip underneath. */
export function FocusView({ items, now, timezone, day, onOpenPublication }: DayViewProps) {
  const sorted = [...items].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  const done = sorted
    .filter((item) => !isAhead(item, now))
    .slice(-3)
    .reverse();
  const ahead = sorted.filter((item) => isAhead(item, now));
  const [next, ...later] = ahead;
  return (
    <div className={styles.focus}>
      <section className={styles.focusCol} aria-label="Уже ушло">
        <h3 className={styles.focusTitle}>Уже ушло</h3>
        {done.length === 0 ? <p className={styles.quiet}>Пока ничего</p> : null}
        {done.map((item) => (
          <PublicationChip
            key={item.publicationId}
            item={item}
            timezone={timezone}
            onOpen={() => onOpenPublication(item.publicationId)}
          />
        ))}
      </section>
      <section className={styles.focusNext} aria-label="Следующая">
        {next ? (
          <AriaButton className={styles.nextCard} onPress={() => onOpenPublication(next.publicationId)}>
            <span className={styles.nextIn}>через {untilShort(next.scheduledAt, now)}</span>
            <span className={styles.nextTitle}>{next.postTitle}</span>
            <span className={styles.pubMeta}>
              {next.destinationName} · {formatClock(next.scheduledAt, timezone)}
            </span>
          </AriaButton>
        ) : (
          <p className={styles.quiet}>Сегодня больше ничего не запланировано</p>
        )}
      </section>
      <section className={styles.focusCol} aria-label="Дальше сегодня">
        <h3 className={styles.focusTitle}>Дальше сегодня</h3>
        {later.length === 0 ? <p className={styles.quiet}>Ничего</p> : null}
        {later.slice(0, 3).map((item) => (
          <PublicationChip
            key={item.publicationId}
            item={item}
            timezone={timezone}
            onOpen={() => onOpenPublication(item.publicationId)}
          />
        ))}
      </section>
      <div
        className={styles.mini}
        aria-hidden="true"
        style={{ '--now': `${dayPercent(now.getTime(), day)}%` } as CSSProperties}
      >
        {items.map((item) => (
          <span
            key={item.publicationId}
            className={styles.miniDot}
            style={{
              insetInlineStart: `${dayPercent(item.scheduledAt, day)}%`,
              ...toneStyle(statusMeta(item.status).group)
            }}
          />
        ))}
      </div>
    </div>
  );
}

/** Г. 24 hour cells: how busy each hour is (publications and events), a problem hour outlined. */
export function HeatView({ items, events, day, now, onOpenRange }: DayViewProps) {
  const from = Date.parse(day.from);
  const hourOf = (iso: string) => Math.min(23, Math.max(0, Math.floor((Date.parse(iso) - from) / 3_600_000)));
  const cells = Array.from({ length: 24 }, () => ({ pubs: 0, events: 0, problem: false }));
  for (const item of items) {
    const cell = cells[hourOf(item.scheduledAt)];
    if (!cell) continue;
    cell.pubs += 1;
    if (item.status === 'failed' || item.status === 'unknown') cell.problem = true;
  }
  for (const event of events) {
    const cell = cells[hourOf(event.at)];
    if (!cell) continue;
    cell.events += 1;
    if (event.category === 'errors') cell.problem = true;
  }
  const max = Math.max(1, ...cells.map((cell) => cell.pubs * 2 + cell.events));
  const nowHour = hourOf(now.toISOString());
  return (
    <div className={styles.heat}>
      <ol className={styles.heatRow}>
        {cells.map((cell, hour) => {
          const level = (cell.pubs * 2 + cell.events) / max;
          const range = {
            from: new Date(from + hour * 3_600_000).toISOString(),
            to: new Date(from + (hour + 1) * 3_600_000).toISOString()
          };
          return (
            <li key={hour}>
              <Tooltip
                content={`${String(hour).padStart(2, '0')}:00 — публикаций ${cell.pubs}, событий ${cell.events}`}
              >
                <AriaButton
                  className={styles.heatCell}
                  data-problem={cell.problem || undefined}
                  data-now={hour === nowHour || undefined}
                  style={{ '--level': level } as CSSProperties}
                  aria-label={`${hour}:00, публикаций ${cell.pubs}, событий ${cell.events}`}
                  onPress={() => onOpenRange(range)}
                >
                  {cell.pubs > 0 ? cell.pubs : ''}
                </AriaButton>
              </Tooltip>
            </li>
          );
        })}
      </ol>
      <div className={styles.heatAxis} aria-hidden="true">
        {[0, 6, 12, 18, 24].map((hour) => (
          <span key={hour}>{String(hour).padStart(2, '0')}</span>
        ))}
      </div>
    </div>
  );
}

/** Е. Only what is ahead, with an urgency bar: red within 10 minutes or sending, amber within two hours. */
export function UrgencyView({ items, now, timezone, onOpenPublication }: DayViewProps) {
  const ahead = [...items]
    .filter((item) => isAhead(item, now))
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  if (ahead.length === 0) return <p className={styles.quiet}>Сегодня впереди ничего не запланировано.</p>;
  return (
    <ol className={styles.urgency}>
      {ahead.map((item) => {
        const minutes = (Date.parse(item.scheduledAt) - now.getTime()) / 60_000;
        const urgency =
          item.status === 'sending' || item.status === 'preparing' || minutes <= 10
            ? 'now'
            : minutes <= 120
              ? 'soon'
              : 'later';
        return (
          <li key={item.publicationId}>
            <AriaButton
              className={styles.urgencyRow}
              data-urgency={urgency}
              onPress={() => onOpenPublication(item.publicationId)}
            >
              <span className={styles.urgencyWhen}>
                <strong>{formatClock(item.scheduledAt, timezone)}</strong>
                <span>через {untilShort(item.scheduledAt, now)}</span>
              </span>
              <span className={styles.pubText}>
                <span className={styles.pubTitle}>{item.postTitle}</span>
                <span className={styles.pubMeta}>{item.destinationName}</span>
              </span>
            </AriaButton>
          </li>
        );
      })}
    </ol>
  );
}

/** Ж. One lane per channel on the 00–24 scale, like a Gantt row. */
export function ChannelLanesView({ items, day, now, timezone, onOpenPublication }: DayViewProps) {
  const channels = [...new Set(items.map((item) => item.destinationName))];
  const nowPercent = dayPercent(now.getTime(), day);
  if (channels.length === 0) return <p className={styles.quiet}>На сегодня ничего не запланировано.</p>;
  return (
    <div className={styles.lanes} style={{ '--now': `${nowPercent}%` } as CSSProperties}>
      {channels.map((channel) => (
        <div key={channel} className={styles.lane}>
          <span className={styles.laneLabel}>
            <span className={styles.avatar}>{avatarLetter(channel)}</span>
            <span className={styles.laneName}>{channel}</span>
          </span>
          <span className={styles.laneTrack}>
            <span className={styles.laneNow} aria-hidden="true" />
            {items
              .filter((item) => item.destinationName === channel)
              .map((item) => {
                const meta = statusMeta(item.status);
                return (
                  <Tooltip
                    key={item.publicationId}
                    content={`${formatClock(item.scheduledAt, timezone)} · ${item.postTitle} · ${meta.label}`}
                  >
                    <AriaButton
                      className={styles.laneDot}
                      style={{ insetInlineStart: `${dayPercent(item.scheduledAt, day)}%`, ...toneStyle(meta.group) }}
                      aria-label={`${formatClock(item.scheduledAt, timezone)}, ${item.postTitle}, ${meta.label}`}
                      onPress={() => onOpenPublication(item.publicationId)}
                    >
                      <Icon name={meta.icon} size={12} />
                    </AriaButton>
                  </Tooltip>
                );
              })}
          </span>
        </div>
      ))}
      <div className={styles.laneAxis} aria-hidden="true">
        <span />
        <span className={styles.laneHours}>
          {[0, 6, 12, 18, 24].map((hour) => (
            <span key={hour}>{String(hour).padStart(2, '0')}</span>
          ))}
        </span>
      </div>
    </div>
  );
}

/** З. The day as a 24-hour dial: publications on the ring, a «сейчас» hand, the next one in the middle. */
export function ClockView({ items, events, day, now, timezone, onOpenPublication, onOpenActivity }: DayViewProps) {
  const size = 220;
  const center = size / 2;
  const ring = 76;
  const point = (percent: number, radius: number) => {
    const angle = (percent / 100) * 2 * Math.PI - Math.PI / 2;
    return { x: center + radius * Math.cos(angle), y: center + radius * Math.sin(angle) };
  };
  const nowPoint = point(dayPercent(now.getTime(), day), ring - 14);
  const next = [...items]
    .filter((item) => isAhead(item, now))
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))[0];
  return (
    <div className={styles.clock}>
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className={styles.dial}
        aria-hidden="true"
      >
        <circle cx={center} cy={center} r={ring} className={styles.dialRing} />
        {Array.from({ length: 24 }, (_, hour) => {
          const outer = point((hour / 24) * 100, ring + 6);
          const inner = point((hour / 24) * 100, ring + (hour % 6 === 0 ? 14 : 10));
          return <line key={hour} x1={outer.x} y1={outer.y} x2={inner.x} y2={inner.y} className={styles.dialTick} />;
        })}
        {[0, 6, 12, 18].map((hour) => {
          const label = point((hour / 24) * 100, ring + 26);
          return (
            <text
              key={hour}
              x={label.x}
              y={label.y}
              className={styles.dialLabel}
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {String(hour).padStart(2, '0')}
            </text>
          );
        })}
        <line x1={center} y1={center} x2={nowPoint.x} y2={nowPoint.y} className={styles.dialHand} />
        <circle cx={center} cy={center} r={4} className={styles.dialHub} />
      </svg>
      <ul className={styles.dialMarkers} style={{ '--size': `${size}px` } as CSSProperties}>
        {items.map((item) => {
          const at = point(dayPercent(item.scheduledAt, day), ring);
          const meta = statusMeta(item.status);
          return (
            <li
              key={item.publicationId}
              style={{ left: `${(at.x / size) * 100}%`, top: `${(at.y / size) * 100}%`, ...toneStyle(meta.group) }}
            >
              <Tooltip content={`${formatClock(item.scheduledAt, timezone)} · ${item.postTitle}`}>
                <AriaButton
                  className={styles.dialDot}
                  aria-label={`${formatClock(item.scheduledAt, timezone)}, ${item.postTitle}, ${meta.label}`}
                  onPress={() => onOpenPublication(item.publicationId)}
                >
                  <Icon name={meta.icon} size={10} />
                </AriaButton>
              </Tooltip>
            </li>
          );
        })}
        {events
          .filter((event) => event.action !== 'job.succeeded')
          .map((event) => {
            const at = point(dayPercent(event.at, day), ring - 28);
            return (
              <li
                key={event.id}
                style={{
                  left: `${(at.x / size) * 100}%`,
                  top: `${(at.y / size) * 100}%`,
                  ...toneStyle(activityView(event).tone)
                }}
              >
                <AriaButton
                  className={styles.dialEvent}
                  aria-label={`${formatClock(event.at, timezone)}, ${activityView(event).text}`}
                  onPress={() => onOpenActivity([event])}
                />
              </li>
            );
          })}
      </ul>
      <div className={styles.dialCenter}>
        {next ? (
          <>
            <span className={styles.nextIn}>через {untilShort(next.scheduledAt, now)}</span>
            <span className={styles.pubMeta}>{next.postTitle}</span>
          </>
        ) : (
          <span className={styles.quiet}>впереди пусто</span>
        )}
      </div>
    </div>
  );
}
