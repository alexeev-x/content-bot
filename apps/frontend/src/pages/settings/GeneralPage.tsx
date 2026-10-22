import { useQuery } from '@tanstack/react-query';
import { BotStatusSummary } from '../../features/bot';
import { GeneralSettingsEditor } from '../../features/owner-settings';
import { publishDestinationsQueryOptions } from '../../features/publications';
import styles from './GeneralPage.module.css';

/** Настройки → Общие (design-refs/general-settings): the bot, the time zone and the alerts. */
export function GeneralPage() {
  const destinations = useQuery(publishDestinationsQueryOptions());
  return (
    <div className={`reading-width ${styles.page}`}>
      <BotStatusSummary />
      <GeneralSettingsEditor channels={destinations.data?.items ?? []} />
    </div>
  );
}
