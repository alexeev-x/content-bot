import { Link, Outlet } from '@tanstack/react-router';
import { ru } from '../../shared/lib/ru';
import styles from './AppLayout.module.css';
import { ThemeSwitch } from './ThemeSwitch';

export function AppLayout() {
  return (
    <div className={styles.shell}>
      <aside className={styles.side}>
        <strong className={styles.brand}>{ru.appName}</strong>
        <nav aria-label={ru.nav.label} className={styles.nav}>
          <Link to="/" activeOptions={{ exact: true }} className={styles.link}>
            {ru.nav.dashboard}
          </Link>
          <Link to="/posts" className={styles.link}>
            {ru.nav.posts}
          </Link>
          <Link to="/calendar" className={styles.link}>
            {ru.nav.calendar}
          </Link>
          <Link to="/media" className={styles.link}>
            {ru.nav.media}
          </Link>
          <Link to="/incidents" className={styles.link}>
            {ru.nav.incidents}
          </Link>
          <Link to="/settings" className={styles.link}>
            {ru.nav.settings}
          </Link>
        </nav>
        <div className={styles.theme}>
          <ThemeSwitch />
        </div>
      </aside>
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}
