import type { SourceEventDto } from '@alexeev/contracts';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { relativeTimeRu } from '../../../shared/lib/ru-format';
import { Icon, Skeleton } from '../../../shared/ui';
import { sourceInboxQueryOptions } from '../api/dashboard-queries';
import { copy } from './copy';
import shell from './Dashboard.module.css';
import styles from './SourceInbox.module.css';
import { Widget } from './Widget';

const TYPE_LABEL: Record<SourceEventDto['type'], string> = { patch: 'Патч', treasure: 'Сокровищница', news: 'Новость' };

/** Dota events waiting for a decision: new ones and auto-drafts not published yet; the decision is made in Источники. */
export function SourceInbox({ now }: { now: Date }) {
  const fresh = useQuery(sourceInboxQueryOptions('new'));
  const drafted = useQuery(sourceInboxQueryOptions('drafted'));
  const loading = fresh.isPending || drafted.isPending;
  const items = [
    ...(fresh.data?.items ?? []),
    ...(drafted.data?.items ?? []).filter((item) => item.publication === null)
  ]
    .sort((a, b) => b.detectedAt.localeCompare(a.detectedAt))
    .slice(0, 5);
  const total =
    (fresh.data?.totalCount ?? 0) + (drafted.data?.items.filter((item) => item.publication === null).length ?? 0);

  return (
    <Widget
      id="source-inbox"
      title={copy.inbox.title}
      busy={loading}
      action={
        <Link to="/sources">
          {copy.inbox.all}
          <Icon name="chevron-right" size={14} />
        </Link>
      }
    >
      <div className={shell.body}>
        {loading ? (
          <ul className={styles.list} aria-hidden="true">
            <li className={styles.row}>
              <Skeleton width="80%" height={14} />
            </li>
            <li className={styles.row}>
              <Skeleton width="60%" height={14} />
            </li>
          </ul>
        ) : items.length === 0 ? (
          <p className={shell.quiet}>{copy.inbox.empty}</p>
        ) : (
          <>
            <p className={shell.quiet}>{copy.inbox.summary(total)}</p>
            <ul className={styles.list}>
              {items.map((item) => (
                <li key={item.id}>
                  <Link to="/sources" className={styles.row}>
                    <span className={styles.type} data-status={item.status}>
                      {item.status === 'drafted' ? copy.inbox.drafted : TYPE_LABEL[item.type]}
                    </span>
                    <span className={styles.title}>{item.draft?.title ?? item.title}</span>
                    <span className={styles.time}>{relativeTimeRu(item.detectedAt, now.getTime())}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Widget>
  );
}
