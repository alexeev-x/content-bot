import type { DestinationDto } from '@alexeev/contracts';
import { Icon, StatusBadge } from '../../../shared/ui';
import { displayChatId } from '../model/chat-id';
import { channelsCopy } from './copy';
import styles from './ChannelRow.module.css';

const copy = channelsCopy.list;

type Props = {
  destination: DestinationDto;
  /** Known only after a rights check in this session; `undefined` shows nothing rather than guessing. */
  botCanPost: boolean | undefined;
  onOpen: (id: string) => void;
};

export function ChannelRow({ destination, botCanPost, onOpen }: Props) {
  const initial = Array.from(destination.title.trim())[0]?.toUpperCase() ?? '#';
  return (
    <li className={styles.item}>
      <button
        type="button"
        className={styles.row}
        aria-label={copy.open(destination.title)}
        onClick={() => onOpen(destination.id)}
      >
        <span className={styles.avatar} aria-hidden="true">
          {initial}
        </span>
        <span className={styles.main}>
          <span className={styles.title}>{destination.title}</span>
          <span className={styles.meta}>
            <span>{copy.kind[destination.kind]}</span>
            <span aria-hidden="true">·</span>
            <span className={styles.id}>{displayChatId(destination.chatId)}</span>
          </span>
        </span>
        <span className={styles.status}>
          <StatusBadge status={destination.enabled ? 'ok' : 'paused'} />
          {botCanPost === undefined ? null : (
            <span className={styles.rights} data-ok={botCanPost}>
              <Icon name={botCanPost ? 'check-circle' : 'alert'} size={16} />
              {botCanPost ? copy.botOk : copy.botBad}
            </span>
          )}
        </span>
        <Icon name="chevron-right" size={18} className={styles.chevron} />
      </button>
    </li>
  );
}
