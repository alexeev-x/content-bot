import { BotQuickActions, BotStatusSummary } from '../../features/bot';
import { DotaWatchlists } from '../../features/dota-intelligence';
import { GeneralSettingsEditor } from '../../features/owner-settings';
import styles from './GeneralPage.module.css';

/** Настройки → Общие (design-refs/general-settings): the bot, time zone and alerts; quick actions on the side. */
export function GeneralPage() {
  return (
    <div className={styles.page}>
      <div className={styles.main}>
        <BotStatusSummary />
        <GeneralSettingsEditor />
        <DotaWatchlists />
      </div>
      <aside className={styles.aside} aria-label="Быстрые действия">
        <BotQuickActions />
      </aside>
    </div>
  );
}
