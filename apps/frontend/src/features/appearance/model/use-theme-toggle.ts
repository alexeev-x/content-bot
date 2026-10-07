import type { AppearanceDto, ThemeMode } from '@alexeev/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';
import { ApiError } from '../../../shared/api/http-client';
import { appearanceKeys, appearanceQueryOptions, useSaveAppearance } from '../api/appearance-queries';
import { toValue, type AppearanceValue, type ThemeName } from './appearance-value';
import { readScreenTheme, useScreenTheme } from './use-screen-theme';

type Options = {
  /** Applies a value to the document without persisting it; must be stable. */
  preview: (value: AppearanceValue) => void;
  /** The save failed, the screen already returned to the server theme. */
  onFailure: () => void;
};

/**
 * One press flips light and dark. The theme shows at once and is saved right away (owner decision 07.10.2026);
 * the query cache still changes only with the server's answer. Presses are serialized and the last one wins.
 * 409: refetch the newest revision and send the same mode once more, silently.
 */
export function useThemeToggle({ preview, onFailure }: Options) {
  const queryClient = useQueryClient();
  const query = useQuery(appearanceQueryOptions());
  const save = useSaveAppearance();
  const screen = useScreenTheme();
  const [announcement, setAnnouncement] = useState('');
  const wanted = useRef<ThemeMode | null>(null);
  const running = useRef(false);

  const cached = useCallback(() => queryClient.getQueryData<AppearanceDto>(appearanceKeys.detail()), [queryClient]);

  const send = useCallback(
    (base: AppearanceDto, themeMode: ThemeMode) =>
      save.mutateAsync({
        ...toValue(base),
        customPresets: [...base.customPresets],
        revision: base.revision,
        themeMode
      }),
    [save]
  );

  const persist = useCallback(
    async (themeMode: ThemeMode): Promise<boolean> => {
      const base = cached();
      if (!base) return false;
      try {
        await send(base, themeMode);
        return true;
      } catch (error) {
        if (!(error instanceof ApiError && error.status === 409)) return false;
      }
      try {
        const fresh = await queryClient.fetchQuery({ ...appearanceQueryOptions(), staleTime: 0 });
        await send(fresh, themeMode);
        return true;
      } catch {
        return false;
      }
    },
    [cached, queryClient, send]
  );

  const drain = useCallback(async () => {
    running.current = true;
    while (wanted.current) {
      const mode = wanted.current;
      wanted.current = null;
      const ok = await persist(mode);
      if (!ok && !wanted.current) {
        const server = cached();
        if (server) preview(toValue(server));
        onFailure();
      }
    }
    running.current = false;
  }, [cached, persist, preview, onFailure]);

  const toggle = useCallback(() => {
    const base = cached();
    if (!base) return;
    const target: ThemeName = readScreenTheme() === 'dark' ? 'light' : 'dark';
    preview({ ...toValue(base), themeMode: target });
    setAnnouncement(target);
    wanted.current = target;
    if (!running.current) void drain();
  }, [cached, drain, preview]);

  return {
    screen,
    toggle,
    announced: announcement === '' ? null : (announcement as ThemeName),
    isReady: query.data !== undefined,
    loadFailed: query.isError && query.data === undefined
  };
}
