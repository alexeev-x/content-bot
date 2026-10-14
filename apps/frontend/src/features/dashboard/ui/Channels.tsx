import { Link } from '@tanstack/react-router';
import { Icon, Skeleton } from '../../../shared/ui';
import type { ChannelRow } from '../model/channel-rows';
import { copy } from './copy';
import styles from './Channels.module.css';
import shell from './Dashboard.module.css';
import { Widget } from './Widget';

const PLACEHOLDERS = ['a', 'b'] as const;

/** Connected channels with the bot's state: the only per-channel health the API offers. */
export function Channels({ channels }: { channels: readonly ChannelRow[] | undefined }) {
  return (
    <Widget
      id="channels"
      title={copy.channels.title}
      busy={channels === undefined}
      action={
        <Link to="/settings/channels">
          {copy.channels.all}
          <Icon name="chevron-right" size={14} />
        </Link>
      }
    >
      <div className={shell.body}>
        {channels === undefined ? (
          <ul className={styles.list} aria-hidden="true">
            {PLACEHOLDERS.map((key) => (
              <li key={key} className={styles.row}>
                <Skeleton width={28} height={28} radius="var(--radius-pill)" />
                <Skeleton width="60%" height={14} />
              </li>
            ))}
          </ul>
        ) : channels.length === 0 ? (
          <p className={shell.quiet}>{copy.channels.empty}</p>
        ) : (
          <ul className={styles.list}>
            {channels.map((channel) => (
              <li key={channel.id} className={styles.row}>
                <span className={styles.avatar} aria-hidden="true">
                  {channel.title.trim().charAt(0).toUpperCase() || '#'}
                </span>
                <span className={styles.text}>
                  <span className={styles.name}>{channel.title}</span>
                  <span className={styles.state} data-tone={channel.tone}>
                    {copy.channels.state[channel.tone]}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Widget>
  );
}
