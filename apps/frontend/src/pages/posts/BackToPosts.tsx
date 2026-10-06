import { Link } from '@tanstack/react-router';
import { postsCopy } from '../../features/posts';
import { Icon } from '../../shared/ui';
import styles from './PostPages.module.css';

export function BackToPosts() {
  return (
    <Link to="/posts" search={{}} className={styles.back}>
      <Icon name="chevron-left" size={16} />
      {postsCopy.editor.back}
    </Link>
  );
}
