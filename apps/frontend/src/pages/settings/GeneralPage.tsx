import { useQuery } from '@tanstack/react-query';
import { readAppEnvironment } from '../../app/environment';
import { BotStatusSummary } from '../../features/bot';
import { GeneralSettingsEditor } from '../../features/owner-settings';
import { publishDestinationsQueryOptions } from '../../features/publications';
import styles from './GeneralPage.module.css';

/** Настройки → Общие (design-refs/general-settings): the bot, the time zone, the automatic publishing, DEV switches. */
export function GeneralPage() {
  const destinations = useQuery(publishDestinationsQueryOptions());
  return (
    <div className={`reading-width ${styles.page}`}>
      <BotStatusSummary />
      <GeneralSettingsEditor
        channels={destinations.data?.items ?? []}
        showBackground={readAppEnvironment() === 'dev'}
      />
    </div>
  );
}
