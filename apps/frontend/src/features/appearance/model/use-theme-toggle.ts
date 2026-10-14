import type { AppearanceDto } from '@alexeev/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { appearanceKeys, appearanceQueryOptions } from '../api/appearance-queries';
import { type AppearanceValue, type ThemeName } from './appearance-value';
import { useAppearanceSaver } from './use-appearance-saver';
import { readScreenTheme, useScreenTheme } from './use-screen-theme';

type Options = {
  /** Applies a value to the document without persisting it; must be stable. */
  preview: (value: AppearanceValue) => void;
  /** The save failed, the screen already returned to the server theme. */
  onFailure: () => void;
};

/** One press flips light and dark; shown at once and saved right away (see useAppearanceSaver). */
export function useThemeToggle({ preview, onFailure }: Options) {
  const queryClient = useQueryClient();
  const query = useQuery(appearanceQueryOptions());
  const { choose } = useAppearanceSaver({ preview, onFailure });
  const screen = useScreenTheme();
  const [announcement, setAnnouncement] = useState('');

  const toggle = useCallback(() => {
    if (!queryClient.getQueryData<AppearanceDto>(appearanceKeys.detail())) return;
    const target: ThemeName = readScreenTheme() === 'dark' ? 'light' : 'dark';
    setAnnouncement(target);
    choose({ themeMode: target });
  }, [queryClient, choose]);

  return {
    screen,
    toggle,
    announced: announcement === '' ? null : (announcement as ThemeName),
    isReady: query.data !== undefined,
    loadFailed: query.isError && query.data === undefined
  };
}
