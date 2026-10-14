import type { ActivityItemDto } from '@alexeev/contracts';
import type { ReactNode } from 'react';
import { formatClock } from '../../../shared/lib/clock';
import { Button, Drawer, Icon, useMediaQuery } from '../../../shared/ui';
import { activityView } from '../model/activity-view';
import { toneStyle } from '../model/tone';
import styles from './ActivityDialog.module.css';
import { copy } from './copy';

type Props = {
  /** One event from «Активность», or the events that share one dot on «Лента дня»; null keeps it closed. */
  items: readonly ActivityItemDto[] | null;
  onClose: () => void;
  timezone: string;
  onOpenPost: (postId: string) => void;
  onOpenPublication: (publicationId: string) => void;
  onOpenMedia: (media: { id: string; fileName: string }) => void;
  /** The page draws a file's preview (Медиа owns private file access); none when it is not given. */
  renderMediaPreview?: ((media: { id: string; fileName: string }) => ReactNode) | undefined;
};

/** What happened, when, by whom and where it leads: each event with its links to the post, the publication or Медиа. */
export function ActivityDialog({
  items,
  onClose,
  timezone,
  onOpenPost,
  onOpenPublication,
  onOpenMedia,
  renderMediaPreview
}: Props) {
  const narrow = useMediaQuery('(max-width: 859px)');
  const open = (go: () => void) => {
    onClose();
    go();
  };
  return (
    <Drawer
      variant={narrow ? 'bottom' : 'side'}
      isOpen={items !== null}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
      title={items && items.length > 1 ? copy.activity.dialogMany(items.length) : copy.activity.dialogOne}
    >
      <ul className={styles.list}>
        {(items ?? []).map((item) => {
          const view = activityView(item);
          const { postId, publicationId } = item;
          return (
            <li key={item.id} className={styles.event} style={toneStyle(view.tone)}>
              <span className={styles.icon} aria-hidden="true">
                <Icon name={view.icon} size={18} />
              </span>
              <div className={styles.text}>
                <strong className={styles.what}>{view.text}</strong>
                {view.subject ? <span className={styles.subject}>«{view.subject}»</span> : null}
                {item.entityType === 'media' && item.action !== 'media.delete' && item.title && renderMediaPreview
                  ? renderMediaPreview({ id: item.entityId, fileName: item.title })
                  : null}
                <dl className={styles.facts}>
                  <div>
                    <dt>{copy.activity.when}</dt>
                    <dd>
                      <time dateTime={item.at}>{formatClock(item.at, timezone)}</time>
                    </dd>
                  </div>
                  <div>
                    <dt>{copy.activity.who}</dt>
                    <dd>{item.actor === 'owner' ? copy.activity.owner : copy.activity.system}</dd>
                  </div>
                  {item.channelTitle ? (
                    <div>
                      <dt>{copy.activity.channel}</dt>
                      <dd>{item.channelTitle}</dd>
                    </div>
                  ) : null}
                  {item.scheduledAt ? (
                    <div>
                      <dt>{copy.activity.planned}</dt>
                      <dd>
                        <time dateTime={item.scheduledAt}>{formatClock(item.scheduledAt, timezone)}</time>
                      </dd>
                    </div>
                  ) : null}
                </dl>
                <div className={styles.links}>
                  {publicationId ? (
                    <Button size="sm" variant="secondary" onPress={() => open(() => onOpenPublication(publicationId))}>
                      {copy.activity.openPublication}
                    </Button>
                  ) : null}
                  {postId ? (
                    <Button size="sm" variant="ghost" onPress={() => open(() => onOpenPost(postId))}>
                      {copy.activity.openPost}
                    </Button>
                  ) : null}
                  {item.entityType === 'media' && item.action !== 'media.delete' && item.title ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onPress={() => {
                        const media = { id: item.entityId, fileName: item.title ?? '' };
                        open(() => onOpenMedia(media));
                      }}
                    >
                      {copy.activity.openMedia}
                    </Button>
                  ) : null}
                  {!postId && !publicationId && item.entityType !== 'media' && item.title === null ? (
                    <span className={styles.gone}>{copy.activity.gone}</span>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </Drawer>
  );
}
