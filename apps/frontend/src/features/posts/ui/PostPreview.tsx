import type { PostEntity } from '@alexeev/contracts';
import { Icon, Panel, TelegramPreview } from '../../../shared/ui';
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
    <Panel>
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
          {length > MESSAGE_LIMIT ? <Icon name="alert" size={16} /> : null}
          <span className="mono">{copy.messageLength(length, MESSAGE_LIMIT)}</span>
          {length > MESSAGE_LIMIT ? <span>{copy.overLimit}</span> : null}
        </p>
      </div>
    </Panel>
  );
}
