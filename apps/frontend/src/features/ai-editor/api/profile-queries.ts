import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAuthorProfile, saveAuthorProfile, syncAuthorDota } from './profile-api';

export const aiEditorKeys = { profile: ['ai-editor', 'profile'] as const };

export function authorProfileQueryOptions() {
  return queryOptions({
    queryKey: aiEditorKeys.profile,
    queryFn: ({ signal }) => getAuthorProfile(signal),
    staleTime: 60_000
  });
}

export function useSaveAuthorProfile() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: saveAuthorProfile,
    retry: false,
    onSuccess: (data) => client.setQueryData(aiEditorKeys.profile, data)
  });
}

export function useSyncAuthorDota() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: syncAuthorDota,
    retry: false,
    onSuccess: (data) => client.setQueryData(aiEditorKeys.profile, data)
  });
}
