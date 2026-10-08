import type { PostDto } from '@alexeev/contracts';
import { formatDayClock } from '../../../shared/lib/clock';
import { Button, MediaTile, PanelList, PanelRow, RowCard } from '../../../shared/ui';
import { copy } from './copy';
import styles from './Dashboard.module.css';
import { EmptyLine, PanelLink, Section, SkeletonRows } from './DashboardPanel';

type Props = {
  /** Undefined while loading (or when the widget is drawn as a skeleton). */
  items: readonly PostDto[] | undefined;
  failed?: boolean;
  onRetry?: () => void;
  narrow: boolean;
  capacity: number;
  onContinue: (postId: string) => void;
  onNewPost: () => void;
};

const titleOf = (post: PostDto) => post.title.trim() || copy.drafts.untitled;

/** The drafts edited last, each with «Продолжить» into the editor. */
export function DraftsPanel({ items, failed, onRetry, narrow, capacity, onContinue, onNewPost }: Props) {
  const shown = items?.slice(0, capacity);
  return (
    <Section
      area="drafts"
      title={copy.drafts.title}
      action={<PanelLink to="/posts" search={{ view: 'drafts' }} text={copy.drafts.all} />}
      rows={capacity}
      busy={items === undefined && !failed}
    >
      {failed ? (
        <EmptyLine
          text={copy.widgetError}
          action={
            onRetry ? (
              <Button size="sm" variant="ghost" onPress={onRetry}>
                {copy.retry}
              </Button>
            ) : undefined
          }
        />
      ) : shown === undefined ? (
        <SkeletonRows count={capacity} />
      ) : shown.length === 0 ? (
        <EmptyLine
          text={copy.drafts.empty}
          action={
            <Button size="sm" variant="ghost" icon="plus" onPress={onNewPost}>
              {copy.newPost}
            </Button>
          }
        />
      ) : (
        <PanelList aria-label={copy.drafts.title}>
          {shown.map((post) =>
            narrow ? (
              <RowCard
                key={post.id}
                title={titleOf(post)}
                media={<MediaTile size={44} icon="edit" />}
                meta={copy.drafts.edited(formatDayClock(post.updatedAt))}
                onPress={() => onContinue(post.id)}
              />
            ) : (
              <PanelRow key={post.id}>
                <MediaTile size={40} icon="edit" />
                <div className={styles.titleBlock}>
                  <span className={styles.rowText} title={titleOf(post)}>
                    {titleOf(post)}
                  </span>
                  <span className={styles.excerpt}>{copy.drafts.edited(formatDayClock(post.updatedAt))}</span>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  aria-label={copy.drafts.continueLabel(titleOf(post))}
                  onPress={() => onContinue(post.id)}
                >
                  {copy.drafts.continue}
                </Button>
              </PanelRow>
            )
          )}
        </PanelList>
      )}
    </Section>
  );
}
