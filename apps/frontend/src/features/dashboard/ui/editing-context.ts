import { createContext } from 'react';

/** True inside an edit-mode card: the panel header hides its actions there (the edit chrome covers that corner). */
export const EditingContext = createContext(false);
