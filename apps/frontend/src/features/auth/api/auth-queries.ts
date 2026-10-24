import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import type { TelegramWidgetSignInInput } from '@alexeev/contracts';
import { clearSession } from '../../../shared/api/session';
import { fetchMe, logoutRequest, signInWithWidget } from './auth-api';

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

export function useSignInWidget() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (user: TelegramWidgetSignInInput) => signInWithWidget(user),
    retry: false,
    // Before the token lands: clearing after it would drop the queries the freshly mounted shell already started,
    // and their observers would wait on removed queries forever (owner name and channel card stuck as skeletons).
    onMutate: () => queryClient.clear()
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
