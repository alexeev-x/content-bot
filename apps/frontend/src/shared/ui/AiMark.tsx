import { Icon } from './Icon';
import { VisuallyHidden } from './VisuallyHidden';
import styles from './AiMark.module.css';

/** The studio-only «ИИ» mark of a text the AI editor wrote; `text` says it in full for a screen reader and a tooltip. */
export function AiMark({ text }: { text: string }) {
  return (
    <span className={styles.mark} title={text}>
      <Icon name="sparkle" size={12} />
      <span aria-hidden="true">ИИ</span>
      <VisuallyHidden>{text}</VisuallyHidden>
    </span>
  );
}
