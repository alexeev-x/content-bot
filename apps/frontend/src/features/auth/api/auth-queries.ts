import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import type { TelegramWidgetSignInInput } from '@alexeev/contracts';
import { clearSession } from '../../../shared/api/session';
import { fetchMe, logoutRequest, signInWithMiniApp, signInWithWidget } from './auth-api';

export const authKeys = {
  all: ['auth'] as const,
  me: () => [...authKeys.all, 'me'] as const
};

export function meQueryOptions() {
  return queryOptions({
    queryKey: authKeys.me(),
    queryFn: ({ signal }) => fetchMe(signal),
    staleTime: 5 * 60_000
  });
}

export function useSignInMiniApp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => signInWithMiniApp(),
    retry: false,
    // Drop anything cached under a previous session before the new one is used.
    onSuccess: () => queryClient.clear()
  });
}

export function useSignInWidget() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (user: TelegramWidgetSignInInput) => signInWithWidget(user),
    retry: false,
    onSuccess: () => queryClient.clear()
  });
}

/** Signs out locally even when the server call fails: the operator must never stay "signed in" on screen. */
export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => logoutRequest(),
    retry: false,
    onSettled: () => {
      clearSession();
      queryClient.clear();
    }
  });
}
