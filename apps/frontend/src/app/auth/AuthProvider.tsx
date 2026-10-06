import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useLogout } from '../../features/auth';
import { getAccessToken, subscribeSession } from '../../shared/api/session';
import { AuthContext, type AuthContextValue, type AuthStatus } from './auth-context';
import { bootstrapSession, type BootResult } from './bootstrap';

const hasSessionSnapshot = () => getAccessToken() !== null;

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const logoutMutation = useLogout();
  const hasSession = useSyncExternalStore(subscribeSession, hasSessionSnapshot, () => false);
  const [boot, setBoot] = useState<BootResult | { kind: 'checking' }>({ kind: 'checking' });
  const [signedOutByUser, setSignedOutByUser] = useState(false);
  const [logoutUnconfirmed, setLogoutUnconfirmed] = useState(false);
  // StrictMode runs the effect twice: both runs share one bootstrap request.
  const pending = useRef<Promise<BootResult> | null>(null);

  const run = useCallback(() => {
    const promise = bootstrapSession();
    pending.current = promise;
    return promise;
  }, []);

  useEffect(() => {
    let active = true;
    void (pending.current ?? run()).then((result) => {
      if (active) setBoot(result);
    });
    return () => {
      active = false;
    };
  }, [run]);

  // A session that disappears (401 after a failed renewal, logout) must not leave the previous
  // session's data in the cache.
  const hadSession = useRef(hasSession);
  useEffect(() => {
    if (hadSession.current && !hasSession) queryClient.clear();
    hadSession.current = hasSession;
  }, [hasSession, queryClient]);

  // Derived during render: a new session forgets the previous sign-out.
  if (hasSession && !logoutMutation.isPending && (signedOutByUser || logoutUnconfirmed)) {
    setSignedOutByUser(false);
    setLogoutUnconfirmed(false);
  }

  const retry = useCallback(() => {
    setBoot({ kind: 'checking' });
    void run().then(setBoot);
  }, [run]);

  const logout = useCallback(async () => {
    setSignedOutByUser(true);
    setLogoutUnconfirmed(false);
    try {
      await logoutMutation.mutateAsync();
    } catch {
      setLogoutUnconfirmed(true);
    }
  }, [logoutMutation]);

  const leaveForbidden = useCallback(() => setBoot({ kind: 'done' }), []);

  let status: AuthStatus;
  if (hasSession) status = 'authenticated';
  else if (boot.kind === 'checking') status = 'checking';
  else if (boot.kind === 'forbidden') status = 'forbidden';
  else if (boot.kind === 'unavailable') status = 'unavailable';
  else status = 'anonymous';

  const error = boot.kind === 'done' ? boot.error : boot.kind === 'unavailable' ? boot.error : undefined;
  const value: AuthContextValue = {
    status,
    error,
    signedOutByUser,
    logoutUnconfirmed,
    retry,
    logout,
    leaveForbidden
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
