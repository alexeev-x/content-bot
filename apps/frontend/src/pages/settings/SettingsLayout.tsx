import { Outlet, useRouterState } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { useMediaQuery } from '../../shared/ui';
import { SectionActionsSlot } from './section-actions';
import { SECTIONS, SettingsFrame, type SectionPath } from './SettingsFrame';
import styles from './SettingsLayout.module.css';

/** Settings as master/detail: a section list beside the detail on wide screens, list and detail as two screens on narrow ones. */
export function SettingsLayout() {
  const wide = useMediaQuery('(min-width: 860px)');
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const section = SECTIONS.find((candidate) => pathname.startsWith(candidate.to));
  const atList = section === undefined;
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
    <SettingsFrame
      wide={wide}
      section={section}
      slot={slot}
      rowRef={(to) => (node: HTMLAnchorElement | null) => {
        if (node) rows.current.set(to, node);
        else rows.current.delete(to);
      }}
    >
      {atList ? (
        <Outlet />
      ) : (
        <SectionActionsSlot.Provider value={actionsSlot}>
          <Outlet />
        </SectionActionsSlot.Provider>
      )}
    </SettingsFrame>
  );
}
