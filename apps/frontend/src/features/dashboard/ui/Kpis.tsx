import { Link } from '@tanstack/react-router';
import { formatClock } from '../../../shared/lib/clock';
import { Icon, Skeleton } from '../../../shared/ui';
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
  link?: { search: { view?: 'recent' | 'errors' } | { id: string } };
};

function items(view: DashboardView, now: Date, timezone: string): Item[] {
  const { dashboard, attentionCount, sentToday } = view;
  const next = nextPublication(dashboard.today, dashboard.upcoming, now);
  return [
    {
      key: 'today',
      ...copy.kpi.today,
      value: dashboard.todayTotal >= 100 ? '100+' : String(dashboard.todayTotal),
      // No «today» view on Публикации (needs an API date range): the full list, newest first.
      link: { search: {} }
    },
    {
      key: 'sent',
      ...copy.kpi.sent,
      // `today` lists at most 8 rows: a longer day makes this a lower bound, so it says «+».
      value: dashboard.today.length < dashboard.todayTotal ? `${sentToday}+` : String(sentToday),
      link: { search: { view: 'recent' } }
    },
    {
      key: 'attention',
      ...copy.kpi.attention,
      value: attentionCount >= 99 ? '99+' : String(attentionCount),
      link: { search: { view: 'errors' } }
    },
    {
      key: 'next',
      ...copy.kpi.next,
      value: next ? formatClock(next.scheduledAt, timezone) : '—',
      detail: next ? untilDetail(next.scheduledAt, now, timezone) : copy.kpi.next.detail,
      ...(next ? { link: { search: { id: next.publicationId } } } : {})
    }
  ];
}

function KpiBody({ item }: { item: Item }) {
  return (
    <>
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

type KpisProps = {
  view: DashboardView | undefined;
  now: Date;
  timezone?: string;
};

const KEYS = ['today', 'sent', 'attention', 'next'] as const;

/** Four tiles filling their widget; while loading each keeps its label and swaps value and detail for skeletons. */
export function Kpis({ view, now, timezone = 'Europe/Moscow' }: KpisProps) {
  const loaded = view ? items(view, now, timezone) : undefined;
  return (
    <section className={styles.kpis} aria-label={copy.kpi.label}>
      {loaded
        ? loaded.map((item) =>
            item.link ? (
              <Link
                key={item.key}
                to="/publications"
                search={item.link.search}
                className={`${styles.kpi} ${styles.kpiLink}`}
              >
                <KpiBody item={item} />
              </Link>
            ) : (
              <div key={item.key} className={styles.kpi}>
                <KpiBody item={item} />
              </div>
            )
          )
        : KEYS.map((key) => <KpiSkeleton key={key} kpi={copy.kpi[key]} />)}
    </section>
  );
}
