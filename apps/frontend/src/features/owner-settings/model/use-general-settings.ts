import type { OwnerOperationsSettingsDto } from '@alexeev/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../../../shared/api/http-client';
import {
  ownerOperationsSettingsKey,
  ownerOperationsSettingsQueryOptions,
  useSaveOwnerOperationsSettings
} from '../api/operations-queries';

/** The fields this page edits; the rest of the document keeps its stored value. */
export type SettingsPatch = Partial<{
  timezone: string;
  publicationAlerts: boolean;
  sourceAlerts: boolean;
  recoveryAlerts: boolean;
}>;

export type SettingsProblem = { kind: 'conflict' | 'failed'; requestId?: string | undefined };

const SAVE_DELAY_MS = 400;
const hasKeys = (patch: SettingsPatch) => Object.keys(patch).length > 0;

function toInput(base: OwnerOperationsSettingsDto, patch: SettingsPatch) {
  const sources = patch.sourceAlerts ?? base.notifications.sourceAlerts;
  return {
    revision: base.revision,
    timezone: patch.timezone ?? base.timezone,
    notifications: {
      warningsEnabled: true,
      publicationAlerts: patch.publicationAlerts ?? base.notifications.publicationAlerts,
      sourceAlerts: sources,
      // The page has one «Источники Dota» switch; automation and watchlist alerts follow it.
      automationAlerts: sources,
      dotaWatchlistAlerts: sources,
      recoveryAlerts: patch.recoveryAlerts ?? base.notifications.recoveryAlerts
    }
  };
}

/**
 * Settings that save as the owner changes them: the choice shows at once, a debounced request carries only the
 * changed fields on the stored revision. Nothing is confirmed before the server answers. A 409 keeps the
 * choices on screen and waits for «keep mine» or «load current».
 */
export function useGeneralSettings() {
  const queryClient = useQueryClient();
  const query = useQuery(ownerOperationsSettingsQueryOptions());
  const save = useSaveOwnerOperationsSettings();
  const [pending, setPending] = useState<SettingsPatch>({});
  const [problem, setProblem] = useState<SettingsProblem | null>(null);
  const [saved, setSaved] = useState(false);
  const queued = useRef<SettingsPatch>({});
  const busy = useRef(false);
  const blocked = useRef(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const flush = useCallback(async () => {
    if (busy.current || blocked.current) return;
    busy.current = true;
    while (hasKeys(queued.current)) {
      const patch = queued.current;
      queued.current = {};
      const base = queryClient.getQueryData<OwnerOperationsSettingsDto>(ownerOperationsSettingsKey);
      if (!base) {
        queued.current = { ...patch, ...queued.current };
        break;
      }
      try {
        await save.mutateAsync(toInput(base, patch));
        setProblem(null);
      } catch (error) {
        queued.current = { ...patch, ...queued.current };
        const stale = error instanceof ApiError && error.reason === 'STALE_REVISION';
        blocked.current = stale;
        setProblem({
          kind: stale ? 'conflict' : 'failed',
          requestId: error instanceof ApiError ? error.requestId : undefined
        });
        break;
      }
    }
    busy.current = false;
    if (!hasKeys(queued.current)) {
      setPending({});
      setSaved(true);
    }
  }, [queryClient, save]);

  const change = useCallback(
    (patch: SettingsPatch) => {
      setSaved(false);
      setPending((current) => ({ ...current, ...patch }));
      queued.current = { ...queued.current, ...patch };
      if (!blocked.current) setProblem(null);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void flush(), SAVE_DELAY_MS);
    },
    [flush]
  );

  /** After a failure: send the kept choices again (after a 409 on the newest revision). */
  const keepMine = useCallback(async () => {
    const result = await query.refetch();
    if (result.isError) return;
    blocked.current = false;
    setProblem(null);
    void flush();
  }, [query, flush]);

  /** Drop the kept choices and show the server's version. */
  const loadCurrent = useCallback(async () => {
    const result = await query.refetch();
    if (result.isError) return;
    queued.current = {};
    blocked.current = false;
    setPending({});
    setProblem(null);
  }, [query]);

  const data = query.data;
  const view = data
    ? {
        timezone: pending.timezone ?? data.timezone,
        publicationAlerts: pending.publicationAlerts ?? data.notifications.publicationAlerts,
        sourceAlerts: pending.sourceAlerts ?? data.notifications.sourceAlerts,
        recoveryAlerts: pending.recoveryAlerts ?? data.notifications.recoveryAlerts
      }
    : null;

  return {
    query,
    view,
    problem,
    status: hasKeys(pending) && !problem ? ('saving' as const) : saved ? ('saved' as const) : ('idle' as const),
    isFetching: query.isFetching,
    change,
    keepMine,
    loadCurrent
  };
}
