import { BotWidget } from '../features/bot';
import { SystemHealth } from '../features/system-health';
import { ru } from '../shared/lib/ru';
import { PageHeader } from '../shared/ui';
import styles from './DashboardPage.module.css';

export function DashboardPage() {
  return (
    <>
      <PageHeader title={ru.pages.dashboard} />
      <div className={styles.grid}>
        <SystemHealth />
        <BotWidget />
      </div>
    </>
  );
}
