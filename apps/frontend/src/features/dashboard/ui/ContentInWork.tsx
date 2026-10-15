import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { CSSProperties } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import { relativeTimeRu } from '../../../shared/lib/ru-format';
import { Icon, type IconName, Skeleton } from '../../../shared/ui';
import { workQueryOptions } from '../api/dashboard-queries';
import shell from './Dashboard.module.css';
import styles from './Overview.module.css';
import { Widget } from './Widget';

type Props = {
  now: Date;
  onOpenPost: (postId: string) => void;
};

/** «Контент в работе»: drafts, ready posts and scheduled publications, the flow between them and the posts edited last. */
export function ContentInWork({ now, onOpenPost }: Props) {
  const queries = workQueryOptions();
  const drafts = useQuery(queries.drafts);
  const approved = useQuery(queries.approved);
  const scheduled = useQuery(queries.scheduled);
  const recent = useQuery(queries.recent);
  const counts = [
    {
      id: 'draft',
      icon: 'file' as IconName,
      label: 'Черновики',
      value: drafts.data?.totalCount,
      color: 'var(--color-accent)'
    },
    {
      id: 'ready',
      icon: 'check-circle' as IconName,
      label: 'Готовы',
      value: approved.data?.totalCount,
      color: 'var(--color-status-done-fg)'
    },
    {
      id: 'scheduled',
      icon: 'calendar' as IconName,
      label: 'Запланировано',
      value: scheduled.data?.totalCount,
      color: 'var(--color-status-unknown-fg)'
    }
  ];
  const total = counts.reduce((sum, count) => sum + (count.value ?? 0), 0);
  const loading = drafts.isPending || approved.isPending || scheduled.isPending;
  return (
    <Widget
      id="contentInWork"
      title="Контент в работе"
      busy={loading}
      action={
        <Link to="/posts" className={shell.more}>
          Все посты <Icon name="chevron-right" size={16} />
        </Link>
      }
    >
      <div className={styles.body}>
        <ul className={styles.counts}>
          {counts.map((count) => (
            <li key={count.id}>
              <span className={styles.countLabel}>
                <span className={styles.countIcon} style={{ '--tone': count.color } as CSSProperties}>
                  <Icon name={count.icon} size={14} />
                </span>
                {count.label}
              </span>
              <strong>{count.value ?? '—'}</strong>
            </li>
          ))}
        </ul>
        {total > 0 ? (
          <div className={styles.flow} aria-hidden="true">
            {counts.map((count) =>
              count.value ? (
                <span key={count.id} style={{ flexGrow: count.value, '--tone': count.color } as CSSProperties} />
              ) : null
            )}
          </div>
        ) : null}
        <h3 className={styles.subTitle}>Последние изменения</h3>
        {recent.isPending ? (
          <Skeleton lines={3} height={36} />
        ) : (recent.data?.items ?? []).length === 0 ? (
          <p className={shell.quiet}>Постов пока нет.</p>
        ) : (
          <ul className={styles.recent}>
            {(recent.data?.items ?? []).map((post) => (
              <li key={post.id}>
                <AriaButton className={styles.recentRow} onPress={() => onOpenPost(post.id)}>
                  <span className={styles.recentText}>
                    <span className={styles.recentTitle}>{post.title || 'Без названия'}</span>
                    <span className={shell.quiet}>Обновлён {relativeTimeRu(post.updatedAt, now.getTime())}</span>
                  </span>
                  <span className={styles.status} data-status={post.status}>
                    <Icon name={post.status === 'approved' ? 'check-circle' : 'file'} size={14} />
                    {post.status === 'approved' ? 'Готово' : 'Черновик'}
                  </span>
                </AriaButton>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Widget>
  );
}
