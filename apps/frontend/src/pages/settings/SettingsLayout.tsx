import { Link, Outlet, useRouterState } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { ru } from '../../shared/lib/ru';
import { isInsideTelegram } from '../../shared/telegram/web-app';
import { Icon, PageHeader, useMediaQuery, type IconName } from '../../shared/ui';
import { SectionActionsSlot } from './section-actions';
import styles from './SettingsLayout.module.css';

const SECTIONS = [
  { to: '/settings/channels', label: ru.settings.channels, icon: 'send' },
  { to: '/settings/appearance', label: ru.settings.appearance, icon: 'sparkle' }
] as const satisfies readonly { to: string; label: string; icon: IconName }[];

type SectionPath = (typeof SECTIONS)[number]['to'];

/** Settings as master/detail: a section list beside the detail on wide screens, list and detail as two screens on narrow ones. */
export function SettingsLayout() {
  const wide = useMediaQuery('(min-width: 860px)');
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const section = SECTIONS.find((candidate) => pathname.startsWith(candidate.to));
  const atList = section === undefined;
  const showList = wide || atList;
  const rows = useRef(new Map<SectionPath, HTMLAnchorElement>());
  const lastOpened = useRef<SectionPath | null>(null);
  const [actionsSlot, setActionsSlot] = useState<HTMLElement | null>(null);
  const slot = section ? <span ref={setActionsSlot} className={styles.actions} /> : null;

  // Declared before the focus effect below, which reads it.
  useEffect(() => {
    if (section) lastOpened.current = section.to;
  }, [section]);

  // Coming back to the list (back link, Telegram BackButton, browser Back) lands on the row that was open.
  // Deferred a tick: the shell moves focus to <main> on every route change and would otherwise win.
  useEffect(() => {
    if (wide || !atList || !lastOpened.current) return;
    const row = rows.current.get(lastOpened.current);
    const timer = window.setTimeout(() => row?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [wide, atList]);

  return (
    <>
      {!wide && section && !isInsideTelegram() ? (
        <Link to="/settings" className={styles.back}>
          <Icon name="chevron-left" size={16} />
          {ru.settings.back}
        </Link>
      ) : null}
      <PageHeader
        title={wide || atList ? ru.pages.settings : (section?.label ?? ru.pages.settings)}
        actions={wide ? undefined : slot}
      />
      <div className={styles.layout} data-wide={wide || undefined}>
        {showList ? (
          <nav aria-label={ru.settings.navLabel} className={styles.nav}>
            {SECTIONS.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={styles.link}
                ref={(node) => {
                  if (node) rows.current.set(item.to, node);
                  else rows.current.delete(item.to);
                }}
              >
                <Icon name={item.icon} size={18} />
                <span className={styles.label}>{item.label}</span>
                {wide ? null : <Icon name="chevron-right" size={18} />}
              </Link>
            ))}
          </nav>
        ) : null}
        {atList ? (
          <Outlet />
        ) : (
          <section className={styles.detail} aria-label={section.label}>
            {wide ? (
              <div className={styles.detailHeader}>
                <h2 className={styles.detailTitle}>{section.label}</h2>
                {slot}
              </div>
            ) : null}
            <SectionActionsSlot.Provider value={actionsSlot}>
              <Outlet />
            </SectionActionsSlot.Provider>
          </section>
        )}
      </div>
    </>
  );
}
