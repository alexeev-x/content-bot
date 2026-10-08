import { createContext, useContext } from 'react';

export type SizeToggle = {
  /** Name of the widget, for the button label. */
  title: string;
  /** The widget is large now: the button collapses it. */
  large: boolean;
  pending: boolean;
  onToggle: () => void;
};

/** Set per widget by the view-mode layout; null where the button does not belong (phone, edit mode, skeleton). */
export const SizeToggleContext = createContext<SizeToggle | null>(null);
export const useSizeToggleControl = () => useContext(SizeToggleContext);

/** True inside an edit-mode card: the panel header hides its actions there (the edit chrome covers that corner). */
export const EditingContext = createContext(false);
