import { useQuery } from '@tanstack/react-query';
import { Button, Drawer, Skeleton, useMediaQuery } from '../../../shared/ui';
import { mediaUsageQueryOptions } from '../api/media-queries';
import styles from './MediaPanel.module.css';
import { PrivateMediaPreview } from './PrivateMediaPreview';

type Kind = 'photo' | 'animation' | 'video';

/** The kind from the file name: the activity feed knows only the name, and the preview only needs the family. */
export function mediaKindOf(fileName: string): Kind {
  const extension = fileName.split('.').pop()?.toLowerCase() ?? '';
  if (extension === 'gif') return 'animation';
  if (['mp4', 'mov', 'webm', 'm4v'].includes(extension)) return 'video';
  return 'photo';
}

/** A small preview for lists outside Медиа (the activity panel): the private file, loaded on demand. */
export function MediaThumb({ mediaId, fileName }: { mediaId: string; fileName: string }) {
  return (
    <span className={styles.thumb}>
      <PrivateMediaPreview mediaId={mediaId} kind={mediaKindOf(fileName)} />
    </span>
  );
}

type Props = {
  /** The file to show; null keeps the panel closed. */
  media: { id: string; fileName: string } | null;
  onClose: () => void;
  onOpenPost: (postId: string) => void;
  /** «Открыть в Медиа»: the full library card with crop, attach and delete. */
  onOpenLibrary: (mediaId: string) => void;
};

const GROUPS = [
  { key: 'drafts', title: 'В черновиках' },
  { key: 'approved', title: 'В одобренных постах' },
  { key: 'scheduled', title: 'Запланированы' },
  { key: 'sending', title: 'Отправляются' },
  { key: 'sent', title: 'Уже отправлены' }
] as const;

/** One file over the current page: the preview and every post that uses it; editing stays in Медиа. */
export function MediaPanel({ media, onClose, onOpenPost, onOpenLibrary }: Props) {
  const narrow = useMediaQuery('(max-width: 859px)');
  const usage = useQuery({ ...mediaUsageQueryOptions(media?.id ?? ''), enabled: media !== null });
  return (
    <Drawer
      variant={narrow ? 'bottom' : 'side'}
      isOpen={media !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={media?.fileName ?? ''}
      footer={
        media ? (
          <Button
            variant="secondary"
            onPress={() => {
              onClose();
              onOpenLibrary(media.id);
            }}
          >
            Открыть в Медиа
          </Button>
        ) : null
      }
    >
      {media ? (
        <div className={styles.body}>
          <PrivateMediaPreview mediaId={media.id} kind={mediaKindOf(media.fileName)} eager allowRetry />
          <section aria-label="Где используется" className={styles.usage}>
            <h3 className={styles.heading}>Где используется</h3>
            {usage.isPending ? (
              <Skeleton height={48} />
            ) : usage.isError ? (
              <p className={styles.quiet}>Не удалось загрузить, где используется файл.</p>
            ) : GROUPS.every((group) => usage.data[group.key].length === 0) ? (
              <p className={styles.quiet}>Файл пока не прикреплён ни к одному посту.</p>
            ) : (
              GROUPS.filter((group) => usage.data[group.key].length > 0).map((group) => (
                <div key={group.key} className={styles.group}>
                  <h4 className={styles.groupTitle}>{group.title}</h4>
                  <ul className={styles.list}>
                    {usage.data[group.key].map((post) => (
                      <li key={`${group.key}-${post.postId}`}>
                        <Button variant="link" onPress={() => onOpenPost(post.postId)}>
                          {post.title || 'Без названия'}
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            )}
          </section>
        </div>
      ) : null}
    </Drawer>
  );
}
