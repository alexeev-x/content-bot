import { BotStatusSummary } from '../../features/bot';
import { GeneralSettingsEditor } from '../../features/owner-settings';
import styles from './GeneralPage.module.css';

export function GeneralPage() {
  return (
    <div className={`reading-width ${styles.page}`}>
      <BotStatusSummary />
      <GeneralSettingsEditor />
    </div>
  );
}
