import { Button, Icon, Panel } from '../../../shared/ui';
import { postsCopy } from './copy';
import styles from './PostKindNote.module.css';

type Props = {
  /** The kind of the saved post, which the other tab cannot edit. */
  kind: 'text' | 'poll';
  onCreate: () => void;
};

const copy = postsCopy.poll;

/** A saved post keeps its kind: a text post has no poll and a poll has no text, so the other tab sends you to a new post. */
export function PostKindNote({ kind, onCreate }: Props) {
  const isText = kind === 'text';
  return (
    <Panel title={isText ? copy.textPostTitle : copy.pollPostTitle} icon={<Icon name={isText ? 'file' : 'list'} />}>
      <div className={styles.note}>
        <p>{isText ? copy.textPostBody : copy.pollPostBody}</p>
        <Button variant="secondary" size="sm" icon="plus" onPress={onCreate}>
          {isText ? copy.createPoll : copy.createText}
        </Button>
      </div>
    </Panel>
  );
}
