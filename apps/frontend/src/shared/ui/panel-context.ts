import { createContext, useContext } from 'react';

/** True inside a Panel body: nested surfaces (StatTile, a flat Panel) drop their own border and background. */
const PanelContext = createContext(false);

export const PanelProvider = PanelContext.Provider;

export function useInPanel(): boolean {
  return useContext(PanelContext);
}
