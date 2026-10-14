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
  link?: { to: '/incidents' } | { to: '/publications'; search: { view?: 'recent' } | { id: string } };
};

export type KpiKey = 'today' | 'sent' | 'attention' | 'next';

function items(view: DashboardView, now: Date, timezone: string): Item[] {
  const { dashboard, attentionCount, sentToday } = view;
  const next = nextPublication(dashboard.today, dashboard.upcoming, now);
  return [
    {
      key: 'today',
      ...copy.kpi.today,
      value: dashboard.todayTotal >= 100 ? '100+' : String(dashboard.todayTotal),
      // No «today» view on Публикации (needs an API date range): the full list, newest first.
      link: { to: '/publications', search: {} }
    },
    {
      key: 'sent',
      ...copy.kpi.sent,
      // `today` lists at most 8 rows: a longer day makes this a lower bound, so it says «+».
      value: dashboard.today.length < dashboard.todayTotal ? `${sentToday}+` : String(sentToday),
      link: { to: '/publications', search: { view: 'recent' } }
    },
    {
      key: 'attention',
      ...copy.kpi.attention,
      value: attentionCount >= 99 ? '99+' : String(attentionCount),
      link: { to: '/incidents' }
    },
    {
      key: 'next',
      ...copy.kpi.next,
      value: next ? formatClock(next.scheduledAt, timezone) : '—',
      detail: next ? untilDetail(next.scheduledAt, now, timezone) : copy.kpi.next.detail,
      ...(next ? { link: { to: '/publications' as const, search: { id: next.publicationId } } } : {})
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

const KEYS: readonly KpiKey[] = ['today', 'sent', 'attention', 'next'];

type KpisProps = {
  view: DashboardView | undefined;
  now: Date;
  timezone?: string;
  /** One tile (the single-KPI widgets) instead of all four. */
  only?: KpiKey;
};

/** Four tiles filling their widget; while loading each keeps its label and swaps value and detail for skeletons. */
export function Kpis({ view, now, only, timezone = 'Europe/Moscow' }: KpisProps) {
  const keys = only ? [only] : KEYS;
  const loaded = view ? items(view, now, timezone).filter((item) => keys.includes(item.key as KpiKey)) : undefined;
  const Tag = only ? 'div' : 'section';
  return (
    <Tag
      className={styles.kpis}
      data-single={only ? '' : undefined}
      {...(only ? {} : { 'aria-label': copy.kpi.label })}
    >
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
        : keys.map((key) => <KpiSkeleton key={key} kpi={copy.kpi[key]} />)}
    </Tag>
  );
}
