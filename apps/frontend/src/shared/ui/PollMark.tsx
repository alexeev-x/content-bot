import { Icon } from './Icon';
import styles from './AiMark.module.css';

/** The small «Опрос» mark of a poll post in lists and headers: the icon plus the word, never colour alone. */
export function PollMark({ label }: { label: string }) {
  return (
    <span className={styles.mark}>
      <Icon name="list" size={12} />
      <span>{label}</span>
    </span>
  );
}
