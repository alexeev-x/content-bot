import { Link } from '@tanstack/react-router';
import { Icon } from '../../shared/ui';
import { DEMO_SUBSCRIBERS } from './home-data';
import { BASE, useProtoSearch } from './proto-kit';
import { useProtoStore } from './proto-store';
import styles from './ChannelCard.module.css';

/** Sidebar «Подключённый канал»: one row, the first enabled channel; subscribers live in the tooltip. */
export function ChannelCard({ collapsed }: { collapsed: boolean }) {
  const { channels } = useProtoStore();
  const state = useProtoSearch().state;
  const channel = state === 'nochannel' ? undefined : channels.find((item) => item.enabled);
  const name = channel?.name.split(':')[0] ?? 'Канал не подключён';
  const ok = channel?.state === 'ok';
  const word = !channel ? 'добавить' : ok ? 'работает' : 'нет прав';
  const subs = state === 'real' ? 'Подписчики: —' : `${DEMO_SUBSCRIBERS} (демо)`;
  const target = `${BASE}/settings/channels` as never;
  const label = `Подключённый канал: ${name}, ${word}`;
  const tip = channel ? `${name} · ${subs}` : 'Канал не подключён. Добавить в настройках';
  return (
    <Link to={target} className={styles.row} aria-label={label} title={tip} data-collapsed={collapsed || undefined}>
      <span className={styles.avatar} data-empty={channel ? undefined : ''}>
        <Icon name="send" size={16} />
      </span>
      {collapsed ? null : (
        <>
          <span className={styles.name}>{name}</span>
          <span className={styles.dot} data-tone={!channel ? 'muted' : ok ? 'ok' : 'warn'} aria-hidden="true" />
        </>
      )}
    </Link>
  );
}
