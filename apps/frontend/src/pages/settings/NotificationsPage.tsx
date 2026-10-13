import { BotStatusSummary } from '../../features/bot';
import { OperationsSettingsEditor } from '../../features/owner-settings';
import styles from './NotificationsPage.module.css';

export function NotificationsPage() {
  return (
    <div className={`reading-width ${styles.page}`}>
      <BotStatusSummary />
      <OperationsSettingsEditor section="notifications" />
    </div>
  );
}
