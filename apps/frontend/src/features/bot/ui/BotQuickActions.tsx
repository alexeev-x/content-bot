import { useQuery } from '@tanstack/react-query';
import { Link as RouterLink } from '@tanstack/react-router';
import { Button as AriaButton } from 'react-aria-components';
import { Icon, IconBadge, type IconName, Panel, useToast } from '../../../shared/ui';
import { botStatusQueryOptions } from '../api/bot-queries';
import { botCopy } from './copy';
import styles from './BotQuickActions.module.css';

const copy = botCopy.quick;

function Row({ icon, label }: { icon: IconName; label: string }) {
  return (
    <>
      <IconBadge name={icon} size="sm" />
      <span className={styles.label}>{label}</span>
      <Icon name="chevron-right" size={16} className={styles.chevron} />
    </>
  );
}

/** «Быстрые действия» beside the settings: only actions that exist — the chat, a fresh state, the related pages. */
export function BotQuickActions() {
  const query = useQuery(botStatusQueryOptions());
  const toast = useToast();
  const username = query.data?.botUsername ?? null;
  const check = () =>
    void query
      .refetch()
      .then((result) =>
        toast.show(
          result.isError ? { tone: 'error', title: copy.checkFailed } : { tone: 'success', title: copy.checked }
        )
      );

  return (
    <Panel title={copy.title} icon={<Icon name="zap" />}>
      <ul className={styles.list}>
        {username ? (
          <li>
            <a className={styles.action} href={`https://t.me/${username}`} target="_blank" rel="noreferrer">
              <Row icon="send" label={copy.openChat} />
            </a>
          </li>
        ) : null}
        <li>
          <AriaButton className={styles.action} onPress={check} isPending={query.isFetching}>
            <Row icon="retry" label={copy.check} />
          </AriaButton>
        </li>
        <li>
          <RouterLink className={styles.action} to="/settings/channels">
            <Row icon="channel" label={copy.channels} />
          </RouterLink>
        </li>
        <li>
          <RouterLink className={styles.action} to="/sources">
            <Row icon="link" label={copy.sources} />
          </RouterLink>
        </li>
      </ul>
    </Panel>
  );
}
