import type { DashboardPublicationDto } from '@alexeev/contracts';
import { Button as AriaButton } from 'react-aria-components';
import { formatClock } from '../../../shared/lib/clock';
import { Icon, Skeleton } from '../../../shared/ui';
import type { ChannelRow } from '../model/channel-rows';
import { toneStyle } from '../model/tone';
import { copy } from './copy';
import shell from './Dashboard.module.css';
import styles from './Preflight.module.css';
import { Widget } from './Widget';

const SHOWN = 4;

type Props = {
  today: readonly DashboardPublicationDto[] | undefined;
  upcoming: readonly DashboardPublicationDto[] | undefined;
  channels: readonly ChannelRow[] | undefined;
  now: Date;
  timezone: string;
  onOpenPublication: (publicationId: string) => void;
};

/** Why a planned send could fail, checked before it is due. Only what the studio knows: the channel and the bot. */
function problemOf(item: DashboardPublicationDto, channels: readonly ChannelRow[]): string | null {
  const channel = channels.find((candidate) => candidate.title === item.destinationName);
  if (!channel) return copy.preflight.channelOff;
  if (channel.tone === 'warn') return copy.preflight.botRights;
  return null;
}

/** The next planned sends with a ✓ when nothing stands in their way, or the reason to look at them now. */
export function Preflight({ today, upcoming, channels, now, timezone, onOpenPublication }: Props) {
  const loaded = today !== undefined && upcoming !== undefined && channels !== undefined;
  const next = loaded
    ? [...today, ...upcoming]
        .filter(
          (item) =>
            (item.status === 'scheduled' || item.status === 'queued') && Date.parse(item.scheduledAt) >= now.getTime()
        )
        .filter((item, index, all) => all.findIndex((other) => other.publicationId === item.publicationId) === index)
        .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))
        .slice(0, SHOWN)
    : [];
  const problems = loaded ? next.filter((item) => problemOf(item, channels) !== null).length : 0;

  return (
    <Widget id="preflight" title={copy.preflight.title} busy={!loaded}>
      <div className={shell.body}>
        {!loaded ? (
          <Skeleton height={96} radius="var(--radius-2)" />
        ) : next.length === 0 ? (
          <p className={shell.quiet}>{copy.preflight.empty}</p>
        ) : (
          <>
            <p className={shell.quiet}>{problems === 0 ? copy.preflight.allClear : copy.preflight.summary(problems)}</p>
            <ul className={styles.list}>
              {next.map((item) => {
                const problem = problemOf(item, channels);
                return (
                  <li key={item.publicationId}>
                    <AriaButton
                      className={styles.row}
                      style={toneStyle(problem ? 'failed' : 'done')}
                      onPress={() => onOpenPublication(item.publicationId)}
                    >
                      <span className={styles.icon} aria-hidden="true">
                        <Icon name={problem ? 'alert' : 'check'} size={14} />
                      </span>
                      <span className={styles.text}>
                        <span className={styles.title}>{item.postTitle}</span>
                        <span className={styles.meta}>
                          {formatClock(item.scheduledAt, timezone)} · {problem ?? copy.preflight.ready}
                        </span>
                      </span>
                    </AriaButton>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </Widget>
  );
}
