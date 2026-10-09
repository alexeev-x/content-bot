import { useState, type ReactNode } from 'react';
import { Icon } from './Icon';
import { IconButton } from './IconButton';
import styles from './MediaListRow.module.css';

type Props = {
  /** File name; it ellipsizes in the middle-ish (end) and carries the full text in `title`. */
  name: string;
  /** Muted second line: «01:24», «4.2 МБ • 4032 × 3024». */
  meta?: string;
  src?: string | undefined;
  kind?: 'image' | 'video';
  /** Video length chip on the thumbnail. */
  duration?: string;
  /** Replaces the default decorative grip. Pass the feature's own drag handle or Up/Down buttons here. */
  handle?: ReactNode;
  /** Hides the grip and its column (a plain list). */
  hideHandle?: boolean;
  /** `square` 44 px (default) or `landscape` 70 × 46 in a 68 px row (post editor). */
  thumb?: 'square' | 'landscape';
  onRemove?: () => void;
  removeLabel?: string;
};

/** Row of the reorder list: handle, 44 px thumbnail, name with meta, remove. Hairline divider; the feature owns drag and move. */
export function MediaListRow({
  name,
  meta,
  src,
  kind = 'image',
  duration,
  handle,
  hideHandle = false,
  thumb = 'square',
  onRemove,
  removeLabel
}: Props) {
  const [failedSrc, setFailedSrc] = useState<string | undefined>(undefined);
  const showImage = Boolean(src) && failedSrc !== src;
  return (
    <div className={styles.row} data-thumb={thumb}>
      {hideHandle ? null : (
        <span className={styles.handle}>{handle ?? <Icon name="grip" size={20} strokeWidth={2.5} />}</span>
      )}
      <span className={styles.thumb} aria-hidden="true">
        {showImage ? (
          <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFailedSrc(src)} />
        ) : (
          <Icon name={kind === 'video' ? 'video' : 'image'} size={20} />
        )}
        {kind === 'video' ? (
          <span className={styles.play}>
            <Icon name="play" size={12} fill="currentColor" />
          </span>
        ) : null}
        {duration ? <span className={styles.duration}>{duration}</span> : null}
      </span>
      <span className={styles.text}>
        <span className={styles.name} title={name}>
          {name}
        </span>
        {meta ? <span className={styles.meta}>{meta}</span> : null}
      </span>
      {onRemove && removeLabel ? (
        <IconButton label={removeLabel} icon="x" size="sm" showTooltip={false} onPress={onRemove} />
      ) : null}
    </div>
  );
}
