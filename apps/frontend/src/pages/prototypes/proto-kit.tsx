/* oxlint-disable react/set-state-in-effect -- dev-only prototype: resets local mock state on open/visit and uses simple ARIA roles */
import { useNavigate, useRouterState, useSearch } from '@tanstack/react-router';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { Appearance } from '../../app/theme';
import { useMediaQuery } from '../../shared/ui';

export const BASE = '/__proto';
export type ProtoSearch = {
  state?: string;
  view?: string;
  id?: string;
  mini?: string;
  /** Preview pages: calendar date (YYYY-MM-DD), analytics period, media view mode, inspector tab. */
  date?: string;
  period?: string;
  mode?: string;
  tab?: string;
};

export const useProtoSearch = (): ProtoSearch => useSearch({ strict: false }) as ProtoSearch;

/** Path below `/__proto`, without the leading slash: '' (Обзор), 'posts', 'posts/p1'. */
export function useProtoPath(): string {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  return pathname.slice(BASE.length).replace(/^\/|\/$/g, '');
}

/** Navigates between prototype screens; the typed route tree has no idea about them, hence the casts. */
export function useProtoNavigate() {
  const navigate = useNavigate();
  const mini = useProtoSearch().mini;
  return useCallback(
    (path: string, search: ProtoSearch = {}, replace = false) => {
      const merged = { ...(mini ? { mini } : {}), ...search };
      void navigate({
        to: `${BASE}${path ? `/${path}` : ''}` as never,
        search: merged as never,
        replace
      });
    },
    [navigate, mini]
  );
}

/** Changes only the search params of the current screen (tabs, inspector id, forced state). */
export function useProtoSearchUpdate() {
  const navigate = useNavigate();
  return useCallback(
    (patch: ProtoSearch, replace = true) =>
      void navigate({
        to: '.' as never,
        search: ((previous: ProtoSearch) => ({ ...previous, ...patch })) as never,
        replace
      }),
    [navigate]
  );
}

export const NARROW_QUERY = '(max-width: 859px)';
export const useNarrow = () => useMediaQuery(NARROW_QUERY);

export type Phase = 'loading' | 'ready' | 'empty' | 'error';
const LOAD_MS = 800;

/**
 * A screen shows its skeleton for ~0.8 s on every visit, then data. `?state=loading|empty|error` forces a phase
 * so the owner can inspect each one; `retry` clears a forced error and loads again.
 */
export function useScreenPhase(): { phase: Phase; retry: () => void } {
  const forced = useProtoSearch().state;
  const update = useProtoSearchUpdate();
  const [loaded, setLoaded] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    setLoaded(false);
    const timer = setTimeout(() => setLoaded(true), LOAD_MS);
    return () => clearTimeout(timer);
  }, [attempt]);
  const retry = useCallback(() => {
    if (forced) update({ state: undefined });
    setAttempt((value) => value + 1);
  }, [forced, update]);
  if (forced === 'loading') return { phase: 'loading', retry };
  if (forced === 'error') return { phase: 'error', retry };
  if (!loaded) return { phase: 'loading', retry };
  if (forced === 'empty') return { phase: 'empty', retry };
  return { phase: 'ready', retry };
}

type AppearanceApi = { saved: Appearance; setSaved: (value: Appearance) => void };
export const AppearanceContext = createContext<AppearanceApi | null>(null);
export function useProtoAppearance(): AppearanceApi {
  const api = useContext(AppearanceContext);
  if (!api) throw new Error('useProtoAppearance outside ProtoApp');
  return api;
}
