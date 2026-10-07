import { Icon } from '../../../shared/ui';
import styles from './Dashboard.module.css';

type SummaryItem = {
  key: string;
  label: string;
  value: string;
  detail: string;
  icon: 'calendar' | 'alert' | 'clock' | 'send';
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
      icon: 'calendar'
    },
    {
      key: 'attention',
      label: 'Требует внимания',
      value: String(attentionTotal),
      detail: attentionTotal > 0 ? 'Нужно проверить' : 'Всё под контролем',
      icon: 'alert',
      tone: attentionTotal > 0 ? 'attention' : 'ok'
    },
    {
      key: 'next',
      label: 'Ближайшая публикация',
      value: nextLabel,
      detail: nextLabel === '—' ? 'Пока ничего не запланировано' : 'Следующая по расписанию',
      icon: 'clock'
    },
    {
      key: 'recent',
      label: 'Недавно отправлено',
      value: String(recentCount),
      detail: 'Последние публикации',
      icon: 'send'
    }
  ];

  return (
    <section className={styles.summaryGrid} aria-label="Сводка">
      {items.map((item) => (
        <article
          key={item.key}
          className={styles.summaryCard}
          data-tone={item.tone ?? 'neutral'}
        >
          <span className={styles.summaryIcon} aria-hidden="true">
            <Icon name={item.icon} size={20} />
          </span>
          <div className={styles.summaryBody}>
            <span className={styles.summaryLabel}>{item.label}</span>
            <strong className={styles.summaryValue}>{item.value}</strong>
            <span className={styles.summaryDetail}>{item.detail}</span>
          </div>
        </article>
      ))}
    </section>
  );
}
