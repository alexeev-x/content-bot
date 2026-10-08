import { useInfiniteQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { destinationsInfiniteQueryOptions } from '../../features/destinations';
import { Icon, Skeleton } from '../../shared/ui';
import styles from './ChannelCard.module.css';
import { useShellStatus } from './use-shell-status';

const copy = {
  label: 'Подключённый канал',
  none: 'Канал не подключён',
  noneTip: 'Канал не подключён. Добавить в настройках',
  unavailable: 'Канал: нет данных',
  words: { ok: 'бот работает', check: 'нужна проверка бота', loading: 'проверяем бота' }
} as const;

type Tone = 'ok' | 'warn' | 'muted';

/**
 * Sidebar «Подключённый канал»: one row with the first enabled channel and its state. The state is the bot's check
 * (the only per-channel health the API offers); there is no subscriber count, so none is shown.
 */
export function ChannelCard({ collapsed }: { collapsed: boolean }) {
  const channels = useInfiniteQuery(destinationsInfiniteQueryOptions({ enabled: true }));
  const { checks } = useShellStatus();
  const bot = checks.find((check) => check.id === 'bot');
  const channel = channels.data?.pages[0]?.items[0];

  if (channels.isPending) {
    return (
      <div className={styles.row} data-collapsed={collapsed || undefined} aria-busy="true">
        <Skeleton width={28} height={28} radius="var(--radius-pill)" />
        {collapsed ? null : <Skeleton width="60%" height={14} />}
      </div>
    );
  }

  const failed = channels.isError;
  const name = channel?.title ?? (failed ? copy.unavailable : copy.none);
  const tone: Tone = !channel || !bot || bot.tone === 'loading' ? 'muted' : bot.tone === 'ok' ? 'ok' : 'warn';
  const word = !channel ? '' : tone === 'ok' ? copy.words.ok : tone === 'warn' ? copy.words.check : copy.words.loading;
  const label = word ? `${copy.label}: ${name}, ${word}` : channel ? `${copy.label}: ${name}` : name;
  return (
    <Link
      to="/settings/channels"
      className={styles.row}
      aria-label={label}
      title={channel ? name : copy.noneTip}
      data-collapsed={collapsed || undefined}
    >
      <span className={styles.avatar} data-empty={channel ? undefined : ''}>
        <Icon name="channel" size={16} />
      </span>
      {collapsed ? null : (
        <>
          <span className={styles.name}>{name}</span>
          <span className={styles.dot} data-tone={tone} aria-hidden="true" />
        </>
      )}
    </Link>
  );
}
