import type { PostDto } from '@alexeev/contracts';
import { Icon, VisuallyHidden } from '../../../shared/ui';
import { postsCopy } from './copy';
import styles from './PostRows.module.css';

const copy = postsCopy.origin;

/** Studio-only «ИИ» mark of a post written by the AI editor; nothing for the owner's own posts. */
export function OriginMark({ origin }: { origin: PostDto['origin'] }) {
  if (!origin) return null;
  const text = copy.full(origin.source, origin.editRatio);
  return (
    <span className={styles.origin} title={text}>
      <Icon name="sparkle" size={12} />
      <span aria-hidden="true">{copy.short}</span>
      <VisuallyHidden>{text}</VisuallyHidden>
    </span>
  );
}
