import { NotificationsSettingsEditor } from '../../features/owner-settings';
import styles from './GeneralPage.module.css';

/** Настройки → Уведомления: every notice the bot sends, grouped, each with its own switch (critical ones always on). */
export function NotificationsPage() {
  return (
    <div className={`reading-width ${styles.page}`}>
      <NotificationsSettingsEditor />
    </div>
  );
}
