import { Button } from '../../../shared/ui';
import { copy } from './copy';
import styles from './Dashboard.module.css';
import { Section } from './DashboardPanel';

type Props = {
  onNewPost: () => void;
  onOpenPosts: () => void;
  onAddChannel: () => void;
};

/** Three entry points; they stack in a narrow widget and sit in a row in a wide one. */
export function QuickActionsPanel({ onNewPost, onOpenPosts, onAddChannel }: Props) {
  return (
    <Section area="quick-actions" title={copy.quick.title} rows={2}>
      <div className={styles.quick}>
        <Button icon="plus" onPress={onNewPost}>
          {copy.quick.newPost}
        </Button>
        <Button variant="secondary" icon="send" onPress={onOpenPosts}>
          {copy.quick.publish}
        </Button>
        <Button variant="secondary" icon="link" onPress={onAddChannel}>
          {copy.quick.addChannel}
        </Button>
      </div>
    </Section>
  );
}
