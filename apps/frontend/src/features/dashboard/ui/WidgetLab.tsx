import type { ReactNode } from 'react';
import { nextPublication } from '../model/format';
import type { LayoutItem, WidgetKind } from '../model/widget-catalog';
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
import { renderWidget } from './DashboardLayout';
import {
  ActivityCompact,
  AttentionStrip,
  AttentionTiles,
  DraftList,
  DraftTiles,
  KpiStrip,
  NextCountdown,
  NextThree,
  RecentHero,
  RecentList,
  SystemIcons,
  SystemPill,
  WeekCards,
  WeekSummary
} from './LabWidgets';
import styles from './WidgetLab.module.css';
import { Widget } from './Widget';
import type { WidgetEnv } from './widget-env';

type Variant = { label: string; body: ReactNode };
type Group = { kind: WidgetKind; title: string; variants: readonly Variant[] };

function LabGroup({ group, current }: { group: Group; current: ReactNode }) {
  return (
    <section className={styles.group} aria-labelledby={`lab-${group.kind}`}>
      <h2 id={`lab-${group.kind}`} className={styles.groupTitle}>
        {group.title}
      </h2>
      <div className={styles.variants}>
        <div className={styles.variant}>
          <span className={styles.badge}>А · сейчас</span>
          {current}
        </div>
        {group.variants.map((variant) => (
          <div key={variant.label} className={styles.variant}>
            <span className={styles.badge}>{variant.label}</span>
            <Widget id={`lab-${group.kind}-${variant.label}`} title={group.title}>
              <div className={styles.body}>{variant.body}</div>
            </Widget>
          </div>
        ))}
      </div>
    </section>
  );
}

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
  const loading = <p>Загружаем…</p>;
  const today = dashboard?.today ?? [];
  const upcoming = dashboard?.upcoming ?? [];
  const recent = dashboard?.recentSent ?? [];
  const weekItems = env.week?.data?.items;
  const drafts = env.drafts?.data?.items;
  const groups: Group[] = [
    {
      kind: 'upcoming',
      title: 'Следующая публикация',
      variants: [
        {
          label: 'Б · обратный отсчёт',
          body: dashboard ? (
            <NextCountdown
              today={today}
              upcoming={upcoming}
              recent={recent}
              now={now}
              timezone={env.timezone}
              onOpen={env.onOpenPublication}
            />
          ) : (
            loading
          )
        },
        {
          label: 'В · три ближайших',
          body: dashboard ? (
            <NextThree
              today={today}
              upcoming={upcoming}
              now={now}
              timezone={env.timezone}
              onOpen={env.onOpenPublication}
            />
          ) : (
            loading
          )
        }
      ]
    },
    {
      kind: 'attention',
      title: 'Требует внимания',
      variants: [
        {
          label: 'Б · плитки',
          body: env.view ? <AttentionTiles rows={env.view.rows} onOpenErrors={env.onOpenErrors} /> : loading
        },
        {
          label: 'В · полоса',
          body: env.view ? <AttentionStrip rows={env.view.rows} onOpenErrors={env.onOpenErrors} /> : loading
        }
      ]
    },
    {
      kind: 'week',
      title: 'Неделя',
      variants: [
        {
          label: 'Б · карточки дней',
          body: weekItems ? (
            <WeekCards items={weekItems} now={now} timezone={env.timezone} onOpenDay={env.onOpenDay} />
          ) : (
            loading
          )
        },
        {
          label: 'В · итоги и линия',
          body: weekItems ? (
            <WeekSummary items={weekItems} now={now} timezone={env.timezone} onOpenDay={env.onOpenDay} />
          ) : (
            loading
          )
        }
      ]
    },
    {
      kind: 'drafts',
      title: 'Черновики',
      variants: [
        {
          label: 'Б · список',
          body: drafts ? <DraftList posts={drafts} now={now} onPublish={env.onPublishDraft} /> : loading
        },
        {
          label: 'В · плитки',
          body: drafts ? <DraftTiles posts={drafts} now={now} onPublish={env.onPublishDraft} /> : loading
        }
      ]
    },
    {
      kind: 'recent',
      title: 'Отправлено недавно',
      variants: [
        {
          label: 'Б · список',
          body: dashboard ? (
            <RecentList items={recent} timezone={env.timezone} onOpen={env.onOpenPublication} />
          ) : (
            loading
          )
        },
        {
          label: 'В · последний пост',
          body: dashboard ? (
            <RecentHero items={recent} timezone={env.timezone} now={now} onOpen={env.onOpenPublication} />
          ) : (
            loading
          )
        }
      ]
    },
    {
      kind: 'system',
      title: 'Система',
      variants: [
        { label: 'Б · одна плашка', body: env.services ? <SystemPill services={env.services} /> : loading },
        { label: 'В · значки', body: env.services ? <SystemIcons services={env.services} /> : loading }
      ]
    },
    {
      kind: 'kpi-today',
      title: 'Показатели',
      variants: [
        {
          label: 'Б · одна строка',
          body: dashboard ? (
            <KpiStrip
              today={today}
              todayTotal={dashboard.todayTotal}
              attention={env.view?.attentionCount ?? 0}
              next={nextPublication(today, upcoming, now)}
              now={now}
            />
          ) : (
            loading
          )
        }
      ]
    },
    {
      kind: 'activity',
      title: 'Активность',
      variants: [
        { label: 'Б · таблица', body: <ActivityCompact timezone={env.timezone} onOpen={env.onOpenActivity} /> }
      ]
    }
  ];
  const widgetEnv = { ...env, now };
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
      {groups.map((group) => {
        const item: LayoutItem = { id: `lab-${group.kind}`, kind: group.kind, w: 12 };
        return <LabGroup key={group.kind} group={group} current={renderWidget(item, widgetEnv, phone)} />;
      })}
    </div>
  );
}
