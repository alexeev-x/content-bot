import type { AppearanceDto } from '@alexeev/contracts';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError } from '../../../shared/api/http-client';
import { appearanceQueryOptions, useSaveAppearance } from '../api/appearance-queries';
import { isSameValue, toValue, type AppearanceValue } from './appearance-value';

type Options = {
  /** Applies a value to the document without persisting it (live preview and revert). */
  preview: (value: AppearanceValue) => void;
};

export type SaveProblem = 'conflict' | 'validation' | 'unavailable' | 'forbidden' | 'unauthorized';

export function problemOf(error: unknown): SaveProblem {
  if (error instanceof ApiError) {
    if (error.status === 409) return 'conflict';
    if (error.status === 400 || error.status === 413 || error.status === 422) return 'validation';
    if (error.status === 403) return 'forbidden';
    if (error.status === 401) return 'unauthorized';
  }
  return 'unavailable';
}

/**
 * Local draft over the server appearance. Nothing is optimistic: the cache changes only with the server's
 * answer. Edits survive a 409 until the operator explicitly reloads or re-bases them.
 */
export function useAppearanceEditor({ preview }: Options) {
  const query = useQuery(appearanceQueryOptions());
  const save = useSaveAppearance();
  const server: AppearanceDto | undefined = query.data;
  const [draft, setDraft] = useState<AppearanceValue | null>(null);
  const [baseRevision, setBaseRevision] = useState<number | null>(null);
  const [problem, setProblem] = useState<SaveProblem | null>(null);
  const [requestId, setRequestId] = useState<string | undefined>(undefined);
  const [reloadFailed, setReloadFailed] = useState(false);

  const serverValue = useMemo(() => (server ? toValue(server) : null), [server]);
  const current = draft ?? serverValue;
  const isDirty = draft !== null && serverValue !== null && !isSameValue(draft, serverValue);
  const revision = baseRevision ?? server?.revision ?? 0;

  // Live preview of the draft on the real document.
  useEffect(() => {
    if (current) preview(current);
  }, [current, preview]);

  // Leaving the page with unsaved edits reverts the document to what the server has.
  const latestServer = useRef(serverValue);
  useEffect(() => {
    latestServer.current = serverValue;
  });
  useEffect(
    () => () => {
      if (latestServer.current) preview(latestServer.current);
    },
    [preview]
  );

  const edit = useCallback(
    (change: (value: AppearanceValue) => AppearanceValue) => {
      if (!current) return;
      setDraft(change(current));
      setProblem((previous) => (previous === 'conflict' ? previous : null));
    },
    [current]
  );

  const discard = useCallback(() => {
    setDraft(null);
    setBaseRevision(null);
    setProblem(null);
  }, []);

  const submit = useCallback(async () => {
    if (!draft || !isDirty) return;
    setProblem(null);
    try {
      await save.mutateAsync({ revision, ...draft, customPresets: [...draft.customPresets] });
      setDraft(null);
      setBaseRevision(null);
      return 'saved' as const;
    } catch (error) {
      setProblem(problemOf(error));
      setRequestId(error instanceof ApiError ? error.requestId : undefined);
      return 'failed' as const;
    }
  }, [draft, isDirty, revision, save]);

  /** 409: take the other device's version and drop the local edits (an explicit choice). */
  const reloadFromServer = useCallback(async () => {
    setReloadFailed(false);
    const result = await query.refetch();
    if (result.isError) {
      setReloadFailed(true);
      return;
    }
    discard();
  }, [query, discard]);

  /** 409: keep the local edits and base them on the newest revision; the next save replaces the other version. */
  const keepMine = useCallback(async () => {
    setReloadFailed(false);
    const result = await query.refetch();
    if (result.isError || !result.data) {
      setReloadFailed(true);
      return;
    }
    setBaseRevision(result.data.revision);
    setProblem(null);
  }, [query]);

  return {
    isLoading: query.isPending,
    loadError: query.isError && !server ? query.error : null,
    reload: () => void query.refetch(),
    isFetching: query.isFetching,
    value: current,
    isDirty,
    isSaving: save.isPending,
    problem,
    requestId,
    reloadFailed,
    edit,
    discard,
    submit,
    reloadFromServer,
    keepMine
  };
}
