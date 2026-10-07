import { useNavigate, useRouter, useRouterState } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';
import { parseHex, toHex } from '../shared/lib/color';
import {
  bindBackButton,
  disableVerticalSwipes,
  setTelegramColors,
  syncTelegramViewport,
  type TelegramColors
} from '../shared/telegram/web-app';
import { isTabRoot, parentPath } from './telegram-navigation';
import type { ResolvedTheme } from './theme';

function tokenHex(name: string): string | undefined {
  const rgb = parseHex(getComputedStyle(document.documentElement).getPropertyValue(name).trim());
  return rgb ? toHex(rgb) : undefined;
}

/** Telegram's header, background and bottom bar follow our tokens; undefined when a token is not a hex color. */
export function readTelegramColors(): TelegramColors | undefined {
  const background = tokenHex('--color-bg');
  const bottomBar = tokenHex('--color-surface-1');
  return background && bottomBar ? { header: background, background, bottomBar } : undefined;
}

/**
 * Binds the Mini App chrome to the app: BackButton follows router history, vertical swipes are off,
 * Telegram colors follow the resolved theme and insets follow Telegram events. Every part is a no-op
 * outside Telegram. Mount once inside the router, after the theme is applied to <html>.
 */
export function useTelegramChrome(theme: ResolvedTheme): void {
  const router = useRouter();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const pathnameRef = useRef(pathname);
  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    disableVerticalSwipes();
    return syncTelegramViewport();
  }, []);

  useEffect(() => {
    const colors = readTelegramColors();
    if (colors) setTelegramColors(colors);
  }, [theme]);

  const atRoot = isTabRoot(pathname);
  useEffect(() => {
    if (atRoot) return;
    return bindBackButton(() => {
      if (router.history.canGoBack()) router.history.back();
      else void navigate({ to: parentPath(pathnameRef.current) });
    });
  }, [atRoot, router, navigate]);
}
