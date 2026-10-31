import { useQuery } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import { BotStatusSummary } from '../../features/bot';
import { GeneralSettingsEditor } from '../../features/owner-settings';
import { publishDestinationsQueryOptions } from '../../features/publications';
import { RubricsAutopublishSettings } from '../../features/rubrics';
import styles from './GeneralPage.module.css';

const route = getRouteApi('/settings/general');

/** Настройки → Общие (design-refs/general-settings): the bot, the time zone, the automatic publishing (news and rubrics). */
export function GeneralPage() {
  const destinations = useQuery(publishDestinationsQueryOptions());
  const { tab } = route.useSearch();
  return (
    <div className={`reading-width ${styles.page}`}>
      <BotStatusSummary />
      <GeneralSettingsEditor
        channels={destinations.data?.items ?? []}
        rubricsTab={<RubricsAutopublishSettings />}
        {...(tab === undefined ? {} : { initialAutopublishTab: tab })}
      />
    </div>
  );
}
