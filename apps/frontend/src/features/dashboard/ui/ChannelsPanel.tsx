import type { DestinationDto } from '@alexeev/contracts';
import { Button, MediaTile, PanelList, PanelRow } from '../../../shared/ui';
import type { ServiceRow } from '../model/service-rows';
import { copy } from './copy';
import styles from './Dashboard.module.css';
import { EmptyLine, PanelLink, Section, SkeletonRows } from './DashboardPanel';

type Props = {
  channels: readonly DestinationDto[] | undefined;
  failed?: boolean;
  onRetry?: () => void;
  /** The bot's own check (the page maps it from the system checks). */
  bot: ServiceRow | undefined;
  capacity: number;
  onAddChannel: () => void;
};

const dotTone = (tone: ServiceRow['tone']) =>
  tone === 'ok' ? 'ok' : tone === 'loading' ? 'muted' : tone === 'danger' ? 'bad' : 'warn';

/** The destinations with the bot's state on top; a destination only has «Включён» or «Отключён» (no per-channel health exists). */
export function ChannelsPanel({ channels, failed, onRetry, bot, capacity, onAddChannel }: Props) {
  const shown = channels?.slice(0, Math.max(1, capacity - 1));
  return (
    <Section
      area="channels"
      title={copy.channels.title}
      action={<PanelLink to="/settings/channels" text={copy.channels.all} />}
      rows={capacity}
      busy={channels === undefined && !failed}
    >
      {failed ? (
        <EmptyLine
          text={copy.widgetError}
          action={
            onRetry ? (
              <Button size="sm" variant="ghost" onPress={onRetry}>
                {copy.retry}
              </Button>
            ) : undefined
          }
        />
      ) : shown === undefined ? (
        <SkeletonRows count={capacity} tile={false} />
      ) : (
        <PanelList aria-label={copy.channels.title}>
          {bot ? (
            <PanelRow>
              <span className={styles.sysName}>{copy.channels.bot}</span>
              <span className={styles.sysState} data-tone={bot.off ? 'off' : dotTone(bot.tone)}>
                <span className={styles.dot} aria-hidden="true" />
                {bot.word}
              </span>
            </PanelRow>
          ) : null}
          {shown.length === 0 ? (
            <li className={styles.listEmpty}>
              <EmptyLine
                text={copy.channels.empty}
                action={
                  <Button size="sm" variant="ghost" icon="plus" onPress={onAddChannel}>
                    {copy.channels.add}
                  </Button>
                }
              />
            </li>
          ) : (
            shown.map((channel) => (
              <PanelRow key={channel.id}>
                <MediaTile size={32} icon="channel" />
                <div className={styles.titleBlock}>
                  <span className={styles.rowText} title={channel.title}>
                    {channel.title}
                  </span>
                  <span className={styles.excerpt}>{copy.channels.kind[channel.kind]}</span>
                </div>
                <span className={styles.sysState} data-tone={channel.enabled ? 'ok' : 'off'}>
                  <span className={styles.dot} aria-hidden="true" />
                  {channel.enabled ? copy.channels.enabled : copy.channels.disabled}
                </span>
              </PanelRow>
            ))
          )}
        </PanelList>
      )}
    </Section>
  );
}
