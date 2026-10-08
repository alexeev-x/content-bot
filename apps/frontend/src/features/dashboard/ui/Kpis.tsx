import { Link } from '@tanstack/react-router';
import { formatClock } from '../../../shared/lib/clock';
import { Icon, Skeleton, type IconName } from '../../../shared/ui';
import { nextPublication, untilDetail } from '../model/format';
import { copy } from './copy';
import styles from './Dashboard.module.css';
import type { DashboardView } from './view-model';

type Item = {
  key: string;
  label: string;
  short: string;
  value: string;
  detail: string;
  icon: IconName;
  link?: { to: '/incidents' } | { to: '/publications'; search: { view: 'today' | 'recent' } | { id: string } };
};

function items(view: DashboardView, now: Date): Item[] {
  const { dashboard, attentionCount, sentToday } = view;
  const next = nextPublication(dashboard.today, dashboard.upcoming, now);
  return [
    {
      key: 'today',
      ...copy.kpi.today,
      value: dashboard.todayTotal >= 100 ? '100+' : String(dashboard.todayTotal),
      icon: 'file',
      link: { to: '/publications', search: { view: 'today' } }
    },
    {
      key: 'sent',
      ...copy.kpi.sent,
      // `today` lists at most 8 rows: a longer day makes this a lower bound, so it says «+».
      value: dashboard.today.length < dashboard.todayTotal ? `${sentToday}+` : String(sentToday),
      icon: 'send',
      link: { to: '/publications', search: { view: 'recent' } }
    },
    {
      key: 'attention',
      ...copy.kpi.attention,
      value: attentionCount >= 99 ? '99+' : String(attentionCount),
      icon: 'alert',
      link: { to: '/incidents' }
    },
    {
      key: 'next',
      ...copy.kpi.next,
      value: next ? formatClock(next.scheduledAt) : '—',
      detail: next ? untilDetail(next.scheduledAt, now) : copy.kpi.next.detail,
      icon: 'clock',
      ...(next ? { link: { to: '/publications' as const, search: { id: next.publicationId } } } : {})
    }
  ];
}

function KpiBody({ item }: { item: Item }) {
  return (
    <>
      <span className={styles.kpiIcon}>
        <Icon name={item.icon} size={22} />
      </span>
      <span className={styles.kpiText}>
        <span className={styles.kpiLabel}>
          <span className={styles.full}>{item.label}</span>
          <span className={styles.short}>{item.short}</span>
        </span>
        <span className={styles.kpiValue}>{item.value}</span>
        <span className={styles.kpiDetail}>{item.detail}</span>
      </span>
      {item.link ? <Icon name="chevron-right" size={18} className={styles.kpiChevron} /> : null}
    </>
  );
}

function KpiSkeleton({ kpi }: { kpi: { label: string; short: string } }) {
  return (
    <div className={styles.kpi} aria-busy="true">
      <span className={styles.kpiIcon}>
        <Skeleton width={24} height={24} />
      </span>
      <span className={styles.kpiText}>
        <span className={styles.kpiLabel}>
          <span className={styles.full}>{kpi.label}</span>
          <span className={styles.short}>{kpi.short}</span>
        </span>
        <Skeleton height={26} width="30%" />
        <Skeleton height={12} width="75%" />
      </span>
    </div>
  );
}

/** Four tiles of the same fixed height; while loading each keeps its label and swaps value and detail for skeletons. */
export function Kpis({ view, now }: { view: DashboardView | undefined; now: Date }) {
  const loaded = view ? items(view, now) : undefined;
  return (
    <section className={styles.kpis} aria-label={copy.kpi.label}>
      {loaded
        ? loaded.map((item) => {
            const link = item.link;
            if (!link) {
              return (
                <div key={item.key} className={styles.kpi}>
                  <KpiBody item={item} />
                </div>
              );
            }
            return link.to === '/incidents' ? (
              <Link key={item.key} to="/incidents" className={`${styles.kpi} ${styles.kpiLink}`}>
                <KpiBody item={item} />
              </Link>
            ) : (
              <Link
                key={item.key}
                to="/publications"
                search={link.search}
                className={`${styles.kpi} ${styles.kpiLink}`}
              >
                <KpiBody item={item} />
              </Link>
            );
          })
        : [copy.kpi.today, copy.kpi.sent, copy.kpi.attention, copy.kpi.next].map((kpi) => (
            <KpiSkeleton key={kpi.label} kpi={kpi} />
          ))}
    </section>
  );
}
