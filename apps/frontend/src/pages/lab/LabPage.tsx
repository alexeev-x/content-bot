import { Link, Outlet } from '@tanstack/react-router';
import { useDocumentTitle } from '../../app/use-document-title';
import { ru } from '../../shared/lib/ru';
import { PageHeader } from '../../shared/ui';
import { LAB_SECTIONS } from './lab-sections';
import styles from './LabPage.module.css';

/**
 * «Тестирование» (owner, 26.10.2026): every DEV-only tool, one page each under `/lab/…`, reached from the side menu's
 * submenu (and the links here on a phone). Only a non-production build renders it (routes/lab.tsx).
 */
export function LabPage() {
  useDocumentTitle(ru.nav.lab);
  return (
    <div className={`reading-width ${styles.page}`}>
      <PageHeader
        title={ru.nav.lab}
        focusHeadingOnMount
        description="Только на DEV: в прод этот раздел не попадает — ни пункт меню, ни код."
      />
      <nav aria-label="Разделы тестирования" className={styles.sections}>
        {LAB_SECTIONS.map((section) => (
          <Link key={section.to} to={section.to} className={styles.section} activeProps={{ 'aria-current': 'page' }}>
            {section.label}
          </Link>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}
