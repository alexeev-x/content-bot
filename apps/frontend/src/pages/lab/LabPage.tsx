import { Outlet, useNavigate, useRouterState } from '@tanstack/react-router';
import { useDocumentTitle } from '../../app/use-document-title';
import { ru } from '../../shared/lib/ru';
import { PageHeader, Tab, TabList, Tabs } from '../../shared/ui';
import { LAB_SECTIONS } from './lab-sections';
import styles from './LabPage.module.css';

/**
 * «Тестирование» (owner, 26.10.2026): every DEV-only tool, one page each under `/lab/…`, reached from the side menu's
 * submenu (and the links here on a phone). Only a non-production build renders it (routes/lab.tsx).
 */
export function LabPage() {
  useDocumentTitle(ru.nav.lab);
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const current = LAB_SECTIONS.find((section) => pathname.startsWith(section.to))?.to;
  return (
    <div className={`reading-width ${styles.page}`}>
      <PageHeader
        title={ru.nav.lab}
        focusHeadingOnMount
        description="Только на DEV: в прод этот раздел не попадает — ни пункт меню, ни код."
      />
      <div className={styles.sections}>
        <Tabs
          size="touch"
          fullWidth
          selectedKey={current}
          onSelectionChange={(key) => void navigate({ to: String(key) })}
        >
          <TabList aria-label="Разделы тестирования">
            {LAB_SECTIONS.map((section) => (
              <Tab key={section.to} id={section.to}>
                {section.label}
              </Tab>
            ))}
          </TabList>
        </Tabs>
      </div>
      <Outlet />
    </div>
  );
}
