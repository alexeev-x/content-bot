import type { PostEntity } from '@alexeev/contracts';
import { Card, Icon, TelegramPreview } from '../../../shared/ui';
import { MESSAGE_LIMIT } from '../model/message-length';
import { previewMessage } from '../model/preview-message';
import { postsCopy } from './copy';
import { EntityText } from './EntityText';
import styles from './PostEditor.module.css';

type Props = { title: string; body: string; entities: readonly PostEntity[]; length: number };

const copy = postsCopy.editor;

/** The dispatcher sends the bold title, a blank line and the body as plain text plus entities, link previews off. */
export function PostPreview({ title, body, entities, length }: Props) {
  const isEmpty = title.trim() === '' && body === '';
  const message = previewMessage(title, body, entities);
  return (
    <Card title={copy.previewHeading}>
      <div className={styles.previewBody}>
        {isEmpty ? (
          <TelegramPreview body={copy.previewEmpty} />
        ) : (
          <TelegramPreview body={<EntityText text={message.text} entities={message.entities} />} />
        )}
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
