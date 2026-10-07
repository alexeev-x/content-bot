import { createContext, useContext, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * The element in the settings section's title row that SettingsLayout renders: null until it is mounted,
 * undefined outside SettingsLayout.
 */
export const SectionActionsSlot = createContext<HTMLElement | null | undefined>(undefined);

/**
 * Puts a section's actions into its title row: SettingsLayout owns the title (h2 beside the list, the page header
 * on a phone), so a section page cannot place them there itself. Outside the layout they render in place.
 */
export function SectionActions({ children }: { children: ReactNode }) {
  const slot = useContext(SectionActionsSlot);
  if (slot === undefined) return children;
  return slot ? createPortal(children, slot) : null;
}
