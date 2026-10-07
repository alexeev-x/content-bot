import { Link } from '@tanstack/react-router';
import { Icon } from '../../../shared/ui';
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

type Props = {
  todayTotal: number;
  attentionTotal: number;
  nextLabel: string;
  recentCount: number;
};

export function SummaryCards({ todayTotal, attentionTotal, nextLabel, recentCount }: Props) {
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
      tone: attentionTotal > 0 ? 'attention' : 'ok'
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
    <section className={styles.summaryGrid} aria-label="Сводка">
      {items.map((item) => (
        <Link
          key={item.key}
          to={item.to}
          search={item.to === '/publications' && item.view ? { view: item.view } : undefined}
          className={styles.summaryCard}
          data-tone={item.tone ?? 'neutral'}
          aria-label={`${item.label}: ${item.value}`}
        >
          <span className={styles.summaryIcon} aria-hidden="true">
            <Icon name={item.icon} size={20} />
          </span>
          <span className={styles.summaryBody}>
            <span className={styles.summaryLabel}>{item.label}</span>
            <strong className={styles.summaryValue}>{item.value}</strong>
            <span className={styles.summaryDetail}>{item.detail}</span>
          </span>
          <Icon className={styles.summaryArrow} name="chevron-right" size={16} />
        </Link>
      ))}
    </section>
  );
}
