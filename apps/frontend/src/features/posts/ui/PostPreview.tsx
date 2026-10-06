import { Card, Icon, TelegramPreview } from '../../../shared/ui';
import { MESSAGE_LIMIT } from '../model/message-length';
import { postsCopy } from './copy';
import styles from './PostEditor.module.css';

type Props = { title: string; body: string; length: number };

const copy = postsCopy.editor;

/** The dispatcher sends «<b>title</b>, blank line, body», escaped and with link previews off: plain text renders the same. */
export function PostPreview({ title, body, length }: Props) {
  const isEmpty = title.trim() === '' && body === '';
  return (
    <Card title={copy.previewHeading}>
      <div className={styles.previewBody}>
        {isEmpty ? <TelegramPreview body={copy.previewEmpty} /> : <TelegramPreview title={title.trim()} body={body} />}
        <p className={styles.note}>
          <Icon name="info" size={16} />
          <span>{copy.previewNote}</span>
        </p>
        <p className={styles.note} data-over={length > MESSAGE_LIMIT || undefined}>
          <span className="mono">{copy.messageLength(length, MESSAGE_LIMIT)}</span>
        </p>
      </div>
    </Card>
  );
}
