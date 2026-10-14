import type { ReactNode } from 'react';
import { ownerDayRange } from '../../../shared/lib/owner-timezone';
import { useNow } from '../../../shared/lib/use-now';
import { useMediaQuery } from '../../../shared/ui';
import { PHONE_QUERY } from '../model/phone';
import {
  ChannelLanesView,
  ClockView,
  DAY_VIEWS,
  FocusView,
  HeatView,
  ScheduleView,
  UrgencyView,
  type DayView,
  type DayViewProps
} from './DayViews';
import { DayTimeline } from './DayTimeline';
import styles from './WidgetLab.module.css';
import { Widget } from './Widget';
import type { WidgetEnv } from './widget-env';

const DAY_BODIES: Record<Exclude<DayView, 'lanes'>, (props: DayViewProps) => ReactNode> = {
  schedule: ScheduleView,
  focus: FocusView,
  heat: HeatView,
  urgency: UrgencyView,
  channels: ChannelLanesView,
  clock: ClockView
};

/**
 * DEV-only design trial (owner, 14.10.2026): every candidate look of a widget side by side on the real data, so the
 * owner picks one. Not part of Обзор; deleted once the choices are made.
 */
export function WidgetLab({ env }: { env: Omit<WidgetEnv, 'now' | 'phone'> }) {
  const now = useNow();
  const phone = useMediaQuery(PHONE_QUERY);
  const dashboard = env.view?.dashboard;
  const day = ownerDayRange(now, env.timezone);
  const dayProps: DayViewProps | null = dashboard
    ? {
        items: dashboard.today,
        events: env.dayEvents ?? [],
        day,
        now,
        timezone: env.timezone,
        onOpenPublication: env.onOpenPublication,
        onOpenActivity: env.onOpenActivity,
        onOpenRange: env.onOpenDay
      }
    : null;
  return (
    <div className={styles.lab}>
      <section className={styles.group} aria-labelledby="lab-day">
        <h2 id="lab-day" className={styles.groupTitle}>
          Лента дня
        </h2>
        <div className={styles.variants}>
          <div className={styles.variant}>
            <span className={styles.badge}>{DAY_VIEWS[0]?.label}</span>
            <DayTimeline
              items={dashboard?.today}
              total={dashboard?.todayTotal ?? 0}
              day={day}
              now={now}
              timezone={env.timezone}
              phone={phone}
              onOpenPublication={env.onOpenPublication}
              onNewPost={env.onNewPost}
              events={env.dayEvents}
              onOpenActivity={env.onOpenActivity}
            />
          </div>
          {DAY_VIEWS.slice(1).map((view) => {
            const Body = DAY_BODIES[view.id as Exclude<DayView, 'lanes'>];
            return (
              <div key={view.id} className={styles.variant}>
                <span className={styles.badge}>{view.label}</span>
                <Widget id={`lab-${view.id}`} title="Лента дня">
                  <div className={styles.body}>{dayProps ? <Body {...dayProps} /> : <p>Загружаем…</p>}</div>
                </Widget>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
