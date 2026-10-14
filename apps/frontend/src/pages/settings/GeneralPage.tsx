import { BotStatusSummary } from '../../features/bot';
import { DotaWatchlists } from '../../features/dota-intelligence';
import { GeneralSettingsEditor } from '../../features/owner-settings';
import styles from './GeneralPage.module.css';

export function GeneralPage() {
  return (
    <div className={`reading-width ${styles.page}`}>
      <BotStatusSummary />
      <GeneralSettingsEditor />
      <DotaWatchlists />
    </div>
  );
}
