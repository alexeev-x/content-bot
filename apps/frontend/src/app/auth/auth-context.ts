import { createContext, useContext } from 'react';

export type AuthStatus = 'checking' | 'authenticated' | 'anonymous' | 'forbidden' | 'unavailable';

export type AuthContextValue = {
  status: AuthStatus;
  /** The failure behind `anonymous` (401) or `unavailable`, for the sign-in page to explain. */
  error: unknown;
  /** True after the operator pressed «Выйти»: the login page then does not send them back to where they were. */
  signedOutByUser: boolean;
  /** The server did not confirm the logout (the session is cleared on this device only). */
  logoutUnconfirmed: boolean;
  /** Runs the bootstrap again (Mini App sign-in, browser refresh). */
  retry: () => void;
  logout: () => Promise<void>;
  /** From the «Нет доступа» state back to the sign-in page. */
  leaveForbidden: () => void;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
