import { Link } from '@tanstack/react-router';
import { postsCopy } from '../../features/posts';
import { isInsideTelegram } from '../../shared/telegram/web-app';
import { Icon } from '../../shared/ui';
import styles from './PostPages.module.css';

/** In the Mini App Telegram's BackButton does this job, so the in-page link is dropped there. */
export function BackToPosts() {
  if (isInsideTelegram()) return null;
  return (
    <Link to="/posts" search={{}} className={styles.back}>
      <Icon name="chevron-left" size={16} />
      {postsCopy.editor.back}
    </Link>
  );
}
