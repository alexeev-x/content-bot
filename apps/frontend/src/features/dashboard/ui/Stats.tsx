import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { formatClock } from '../../../shared/lib/clock';
import { Icon, Skeleton, type IconName } from '../../../shared/ui';
import { nextPublication, untilDetail } from '../model/format';
import { dayPercent } from '../model/timeline';
import { accentStyle, toneStyle } from '../model/tone';
import { copy } from './copy';
import styles from './Stats.module.css';
import { Widget } from './Widget';
import type { DashboardView } from './view-model';

type Cell = {
  key: 'today' | 'sent' | 'attention' | 'next';
  icon: IconName;
  label: string;
  value: string;
  detail: string;
  tone: ReturnType<typeof toneStyle>;
  indicator: ReactNode;
  search: { view?: 'recent' | 'errors' } | { id: string };
};

/** Done / waiting / trouble shares of today's listed publications: a tiny segmented bar. */
function Segments({ done, waiting, trouble }: { done: number; waiting: number; trouble: number }) {
  const total = done + waiting + trouble;
  return (
    <span className={styles.segments} aria-hidden="true">
      {total === 0 ? <span className={styles.segmentEmpty} /> : null}
      {done > 0 ? <span className={styles.segmentDone} style={{ flexGrow: done }} /> : null}
      {waiting > 0 ? <span className={styles.segmentWaiting} style={{ flexGrow: waiting }} /> : null}
      {trouble > 0 ? <span className={styles.segmentTrouble} style={{ flexGrow: trouble }} /> : null}
    </span>
  );
}

/** A ring that fills with the share of today's sends already out. */
function Ring({ share }: { share: number }) {
  const filled = Math.round(Math.min(1, Math.max(0, share)) * 100);
  return (
    <svg className={styles.ring} viewBox="0 0 36 36" aria-hidden="true">
      <circle className={styles.ringTrack} cx="18" cy="18" r="15.9155" />
      <circle
        className={styles.ringFill}
        cx="18"
        cy="18"
        r="15.9155"
        strokeDasharray={`${filled} ${100 - filled}`}
        transform="rotate(-90 18 18)"
      />
    </svg>
  );
}

function cells(view: DashboardView, now: Date, timezone: string, day: { from: string; to: string }): Cell[] {
  const { dashboard, attentionCount, sentToday } = view;
  const next = nextPublication(dashboard.today, dashboard.upcoming, now);
  const listed = dashboard.today;
  const trouble = listed.filter((item) => item.status === 'failed' || item.status === 'unknown').length;
  const partial = listed.length < dashboard.todayTotal;
  const waiting = listed.filter((item) => !['sent', 'failed', 'unknown', 'cancelled'].includes(item.status)).length;
  const nextToday = next && Date.parse(next.scheduledAt) < Date.parse(day.to);
  return [
    {
      key: 'today',
      icon: 'calendar',
      label: copy.stats.today.label,
      value: dashboard.todayTotal >= 100 ? '100+' : String(dashboard.todayTotal),
      detail: copy.stats.today.detail,
      tone: accentStyle,
      indicator: <Segments done={sentToday} waiting={waiting} trouble={trouble} />,
      search: {}
    },
    {
      key: 'sent',
      icon: 'check-circle',
      label: copy.stats.sent.label,
      // `today` lists at most 8 rows: a longer day makes this a lower bound, so it says «+».
      value: partial ? `${sentToday}+` : String(sentToday),
      detail: copy.stats.sent.detail,
      tone: toneStyle('done'),
      indicator: <Ring share={listed.length ? sentToday / listed.length : 0} />,
      search: { view: 'recent' }
    },
    {
      key: 'attention',
      icon: 'alert',
      label: copy.stats.attention.label,
      value: attentionCount >= 99 ? '99+' : String(attentionCount),
      detail: attentionCount > 0 ? copy.stats.attention.detailOpen : copy.stats.attention.detailClear,
      tone: toneStyle(attentionCount > 0 ? 'failed' : 'done'),
      indicator: <span className={styles.lamp} data-lit={attentionCount > 0 || undefined} aria-hidden="true" />,
      search: { view: 'errors' }
    },
    {
      key: 'next',
      icon: 'clock',
      label: copy.stats.next.label,
      value: next ? formatClock(next.scheduledAt, timezone) : '—',
      detail: next ? untilDetail(next.scheduledAt, now, timezone) : copy.stats.next.detail,
      tone: toneStyle('active'),
      indicator: (
        <span className={styles.rail} aria-hidden="true">
          {nextToday ? (
            <span className={styles.railDot} style={{ insetInlineStart: `${dayPercent(next.scheduledAt, day)}%` }} />
          ) : null}
        </span>
      ),
      search: next ? { id: next.publicationId } : {}
    }
  ];
}

const KEYS = ['today', 'sent', 'attention', 'next'] as const;

type Props = {
  view: DashboardView | undefined;
  now: Date;
  timezone: string;
  day: { from: string; to: string };
};

/** «Цифры дня»: four cells, each with its own colour cue and its own tiny indicator. */
export function Stats({ view, now, timezone, day }: Props) {
  const loaded = view ? cells(view, now, timezone, day) : undefined;
  return (
    <Widget id="stats" title={copy.stats.label} busy={!view} bare>
      <div className={styles.strip}>
        {loaded
          ? loaded.map((cell) => (
              <Link key={cell.key} to="/publications" search={cell.search} className={styles.cell} style={cell.tone}>
                <span className={styles.cellHead}>
                  <span className={styles.chip}>
                    <Icon name={cell.icon} size={16} />
                  </span>
                  <span className={styles.label}>{cell.label}</span>
                </span>
                <span className={styles.valueRow}>
                  <span className={styles.value}>{cell.value}</span>
                  <span className={styles.indicator}>{cell.indicator}</span>
                </span>
                <span className={styles.detail}>{cell.detail}</span>
              </Link>
            ))
          : KEYS.map((key) => (
              <div key={key} className={styles.cell} style={key === 'today' ? accentStyle : undefined} aria-busy="true">
                <span className={styles.cellHead}>
                  <span className={styles.chip} />
                  <span className={styles.label}>{copy.stats[key].label}</span>
                </span>
                <span className={styles.valueRow}>
                  <Skeleton width={56} height={28} />
                </span>
                <Skeleton width="70%" height={12} />
              </div>
            ))}
      </div>
    </Widget>
  );
}
