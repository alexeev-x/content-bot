import { Link, Outlet } from '@tanstack/react-router';
import { ru } from '../../shared/lib/ru';
import { PageHeader } from '../../shared/ui';
import styles from './SettingsLayout.module.css';

export function SettingsLayout() {
  return (
    <>
      <PageHeader title={ru.pages.settings} description={ru.settings.description} />
      <nav aria-label={ru.settings.navLabel} className={styles.nav}>
        <Link to="/settings/channels" className={styles.link}>
          {ru.settings.channels}
        </Link>
        <Link to="/settings/appearance" className={styles.link}>
          {ru.settings.appearance}
        </Link>
      </nav>
      <Outlet />
    </>
  );
}
