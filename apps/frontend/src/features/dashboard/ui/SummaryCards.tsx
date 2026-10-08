import { Link } from '@tanstack/react-router';
import { Icon, Skeleton } from '../../../shared/ui';
import styles from './Dashboard.module.css';

type SummaryItem = {
  key: string;
  label: string;
  value: string;
  detail: string;
  icon: 'calendar' | 'alert' | 'clock' | 'send';
  to: '/publications' | '/incidents';
  view?: 'today' | 'upcoming' | 'recent';
  tone?: 'attention' | 'ok';
};

type Values = {
  todayTotal: number;
  attentionTotal: number;
  nextLabel: string;
  recentCount: number;
};

/** Without values (loading) every cell keeps its label and swaps the value and detail for same-height skeletons. */
type Props = { values?: Values };

const LOADING: Values = { todayTotal: 0, attentionTotal: 0, nextLabel: '—', recentCount: 0 };

export function SummaryCards({ values }: Props) {
  const loading = values === undefined;
  const { todayTotal, attentionTotal, nextLabel, recentCount } = values ?? LOADING;
  const items: readonly SummaryItem[] = [
    {
      key: 'today',
      label: 'Публикации сегодня',
      value: String(todayTotal),
      detail: 'Запланировано и отправлено',
      icon: 'calendar',
      to: '/publications',
      view: 'today'
    },
    {
      key: 'attention',
      label: 'Требует внимания',
      value: String(attentionTotal),
      detail: attentionTotal > 0 ? 'Нужно проверить' : 'Всё под контролем',
      icon: 'alert',
      to: '/incidents',
      ...(loading ? {} : { tone: attentionTotal > 0 ? ('attention' as const) : ('ok' as const) })
    },
    {
      key: 'next',
      label: 'Ближайшая публикация',
      value: nextLabel,
      detail: nextLabel === '—' ? 'Пока ничего не запланировано' : 'Следующая по расписанию',
      icon: 'clock',
      to: '/publications',
      view: 'upcoming'
    },
    {
      key: 'recent',
      label: 'Недавно отправлено',
      value: String(recentCount),
      detail: 'Последние публикации',
      icon: 'send',
      to: '/publications',
      view: 'recent'
    }
  ];

  return (
    <section className={styles.summaryGrid} aria-label="Сводка" aria-busy={loading || undefined}>
      {items.map((item) => (
        <Link
          key={item.key}
          to={item.to}
          search={item.to === '/publications' && item.view ? { view: item.view } : undefined}
          className={styles.summaryCard}
          data-tone={item.tone ?? 'neutral'}
          aria-label={loading ? item.label : `${item.label}: ${item.value}`}
        >
          <span className={styles.summaryLabel}>
            <Icon name={item.icon} size={16} />
            <span className={styles.summaryLabelText}>{item.label}</span>
            <Icon className={styles.summaryArrow} name="chevron-right" size={16} />
          </span>
          <strong className={styles.summaryValue}>
            {loading ? <Skeleton width="2.5em" height="1.2em" /> : item.value}
          </strong>
          <span className={styles.summaryDetail}>
            {loading ? <Skeleton width="70%" height="1.5em" /> : item.detail}
          </span>
        </Link>
      ))}
    </section>
  );
}
