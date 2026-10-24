import type { PostPageDto } from '@alexeev/contracts';
import type { UseQueryResult } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
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

const SKELETON_ROWS = [0, 1, 2] as const;

/** The newest drafts as equal rows, each with its way to the publish screen. */
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
          // The same cards as the loaded stack (the query asks for 3), so the row keeps its height.
          <ul className={styles.stack} aria-hidden="true">
            {SKELETON_ROWS.map((row) => (
              <li key={row} className={styles.card}>
                <span className={styles.text}>
                  <Skeleton width="70%" height="1lh" />
                  <Skeleton width={72} height={12} />
                </span>
                <Skeleton width={104} height="var(--size-button-sm)" radius="var(--radius-2)" />
              </li>
            ))}
          </ul>
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
            {items.map((post) => (
              <li key={post.id} className={styles.card}>
                <span className={styles.text}>
                  <span className={styles.title}>{post.title.trim() || copy.drafts.untitled}</span>
                  <small>{relativeTimeRu(post.updatedAt, now.getTime())}</small>
                </span>
                <Button
                  size="sm"
                  variant="soft"
                  aria-label={copy.drafts.publishLabel(post.title.trim() || copy.drafts.untitled)}
                  onPress={() => onPublish(post.id)}
                >
                  {copy.drafts.publish}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Widget>
  );
}
