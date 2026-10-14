import type { PostPageDto } from '@alexeev/contracts';
import type { UseQueryResult } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { CSSProperties } from 'react';
import { relativeTimeRu } from '../../../shared/lib/ru-format';
import { Button, Icon, Skeleton } from '../../../shared/ui';
import { copy } from './copy';
import shell from './Dashboard.module.css';
import styles from './Drafts.module.css';
import { Widget } from './Widget';

type Props = {
  query: UseQueryResult<PostPageDto> | undefined;
  now: Date;
  onPublish: (postId: string) => void;
  onNewPost: () => void;
};

/** The newest drafts as a small stack of cards, each with its way to the publish screen. */
export function Drafts({ query, now, onPublish, onNewPost }: Props) {
  const items = query?.data?.items;
  const failed = query !== undefined && !query.data && !query.isPending;
  return (
    <Widget
      id="drafts"
      title={copy.drafts.title}
      busy={query === undefined || query.isPending}
      action={
        <Link to="/posts">
          {copy.drafts.all}
          <Icon name="chevron-right" size={14} />
        </Link>
      }
    >
      <div className={shell.body}>
        {failed ? (
          <div className={shell.emptyBlock}>
            <p className={shell.quiet}>{copy.drafts.error}</p>
            <Button size="sm" variant="secondary" onPress={() => void query.refetch()}>
              {copy.drafts.retry}
            </Button>
          </div>
        ) : items === undefined ? (
          <div className={styles.stack} aria-hidden="true">
            <Skeleton height={76} radius="var(--radius-3)" />
            <Skeleton height={76} radius="var(--radius-3)" />
          </div>
        ) : items.length === 0 ? (
          <div className={shell.emptyBlock}>
            <p className={styles.emptyTitle}>{copy.drafts.empty}</p>
            <p className={shell.quiet}>{copy.drafts.emptyDetail}</p>
            <Button size="sm" variant="secondary" icon="plus" onPress={onNewPost}>
              {copy.newPost}
            </Button>
          </div>
        ) : (
          <ul className={styles.stack}>
            {items.map((post, index) => (
              <li key={post.id} className={styles.card} style={{ '--depth': index } as CSSProperties}>
                <span className={styles.title}>{post.title.trim() || copy.drafts.untitled}</span>
                <span className={styles.foot}>
                  <small>{relativeTimeRu(post.updatedAt, now.getTime())}</small>
                  <Button
                    size="sm"
                    variant="soft"
                    aria-label={copy.drafts.publishLabel(post.title.trim() || copy.drafts.untitled)}
                    onPress={() => onPublish(post.id)}
                  >
                    {copy.drafts.publish}
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Widget>
  );
}
