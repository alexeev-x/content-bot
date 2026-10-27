import type { BackgroundJob, OwnerOperationsSettingsDto } from '@alexeev/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../../../shared/api/http-client';
import {
  ownerOperationsSettingsKey,
  ownerOperationsSettingsQueryOptions,
  useSaveOwnerOperationsSettings
} from '../api/operations-queries';

/** Every notification switch the owner can turn off (critical alerts are not among them). */
export const NOTIFICATION_KEYS = [
  'scheduleNotices',
  'sentNotices',
  'publicationAlerts',
  'recoveryAlerts',
  'draftOffers',
  'sourceAlerts',
  'dotaWatchlistAlerts',
  'automationAlerts',
  'dailyReport',
  'weeklyReport',
  'contentAlerts',
  'aiReviews',
  'scriptPrompts',
  'aiLearning',
  'warningsEnabled'
] as const;
export type NotificationKey = (typeof NOTIFICATION_KEYS)[number];

/** The fields the settings pages edit; the rest of the document keeps its stored value. */
export type SettingsPatch = Partial<Record<NotificationKey, boolean>> &
  Partial<{
    timezone: string;
    dailyReportHour: number;
    autopublishEnabled: boolean;
    autopublishDestinationId: string | null;
    autopublishDailyLimit: number;
    backgroundEnabled: boolean;
    backgroundJobs: Partial<Record<BackgroundJob, boolean>>;
  }>;

export type SettingsProblem = { kind: 'conflict' | 'failed'; requestId?: string | undefined };

const SAVE_DELAY_MS = 400;
const hasKeys = (patch: SettingsPatch) => Object.keys(patch).length > 0;

function toInput(base: OwnerOperationsSettingsDto, patch: SettingsPatch) {
  const notifications = {
    ...base.notifications,
    dailyReportHour: patch.dailyReportHour ?? base.notifications.dailyReportHour
  };
  for (const key of NOTIFICATION_KEYS) notifications[key] = patch[key] ?? base.notifications[key];
  return {
    revision: base.revision,
    timezone: patch.timezone ?? base.timezone,
    notifications,
    autopublish: {
      enabled: patch.autopublishEnabled ?? base.autopublish.enabled,
      destinationId:
        patch.autopublishDestinationId === undefined ? base.autopublish.destinationId : patch.autopublishDestinationId,
      dailyLimit: patch.autopublishDailyLimit ?? base.autopublish.dailyLimit
    },
    background: {
      enabled: patch.backgroundEnabled ?? base.background.enabled,
      jobs: { ...base.background.jobs, ...patch.backgroundJobs }
    }
  };
}

/** Two patches in a row: the later wins, and the background switches add up instead of replacing each other. */
function merge(current: SettingsPatch, next: SettingsPatch): SettingsPatch {
  const merged = { ...current, ...next };
  if (current.backgroundJobs !== undefined || next.backgroundJobs !== undefined) {
    merged.backgroundJobs = { ...current.backgroundJobs, ...next.backgroundJobs };
  }
  return merged;
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
        queued.current = merge(patch, queued.current);
        break;
      }
      try {
        await save.mutateAsync(toInput(base, patch));
        setProblem(null);
      } catch (error) {
        queued.current = merge(patch, queued.current);
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
      setPending((current) => merge(current, patch));
      queued.current = merge(queued.current, patch);
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
        ...(Object.fromEntries(
          NOTIFICATION_KEYS.map((key) => [key, pending[key] ?? data.notifications[key]])
        ) as Record<NotificationKey, boolean>),
        timezone: pending.timezone ?? data.timezone,
        dailyReportHour: pending.dailyReportHour ?? data.notifications.dailyReportHour,
        autopublishEnabled: pending.autopublishEnabled ?? data.autopublish.enabled,
        autopublishDestinationId:
          pending.autopublishDestinationId === undefined
            ? data.autopublish.destinationId
            : pending.autopublishDestinationId,
        autopublishDailyLimit: pending.autopublishDailyLimit ?? data.autopublish.dailyLimit,
        backgroundEnabled: pending.backgroundEnabled ?? data.background.enabled,
        backgroundJobs: { ...data.background.jobs, ...pending.backgroundJobs }
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
