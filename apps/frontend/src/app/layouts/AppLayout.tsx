import { useQuery } from '@tanstack/react-query';
import { Navigate, Outlet, useRouterState } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useAuth } from '../auth';
import { ApiError } from '../../shared/api/http-client';
import { useTelegramChrome } from '../use-telegram-chrome';
import { ThemeToggle, useAppearanceSync } from '../../features/appearance';
import { useOpenIncidentCount } from '../../features/incidents';
import { AuthUnavailableState, NoAccessState, meQueryOptions } from '../../features/auth';
import { ru } from '../../shared/lib/ru';
import { Skeleton } from '../../shared/ui';
import { applyAppearance, useTheme, type Appearance } from '../theme';
import { useDocumentTitle } from '../use-document-title';
import { AppShell } from './AppShell';
import { readOwnerName, writeOwnerName } from './owner-name-cache';
import { ChannelCard } from './ChannelCard';
import styles from './AppShell.module.css';
import { NAV_ITEMS } from './nav-items';
import { RouteSkeleton } from './RouteSkeleton';
import menuStyles from './AccountMenu.module.css';
import { SystemStatusSection, useSystemStatus } from './SystemStatus';

// The sign-in page and the dev catalog use the full viewport: no navigation around them.
const BARE_PATHS = ['/login', '/__catalog'];

const applyServerAppearance = (value: Appearance) => applyAppearance(value);
// The theme button shows its result before the server confirms; only the server answer is persisted.
const previewAppearance = (value: Appearance) => applyAppearance(value, { persist: false });

const THEME_ROW = {
  className: menuStyles.row,
  labelClassName: menuStyles.rowLabel,
  valueClassName: menuStyles.value
};

const channelCard = (collapsed: boolean) => <ChannelCard collapsed={collapsed} />;

function titleFor(pathname: string): string {
  if (pathname === '/') return ru.pages.dashboard;
  if (pathname.startsWith('/settings/appearance')) return ru.appearance.title;
  const item = NAV_ITEMS.find((candidate) =>
    candidate.to === '/' ? pathname === '/' : pathname.startsWith(candidate.to)
  );
  return item?.label ?? ru.appName;
}

function SignedInLayout() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const auth = useAuth();
  const me = useQuery(meQueryOptions());
  const [cachedName] = useState(readOwnerName);
  const confirmedName = me.data?.name;
  useEffect(() => {
    if (confirmedName) writeOwnerName(confirmedName);
  }, [confirmedName]);
  const incidentsCount = useOpenIncidentCount();
  useAppearanceSync(applyServerAppearance);
  // Follows the OS or Telegram scheme while the mode is «system».
  const { resolved } = useTheme();
  useTelegramChrome(resolved);
  useDocumentTitle(titleFor(pathname));
  const status = useSystemStatus();

  if (me.error instanceof ApiError && me.error.status === 403) {
    return <NoAccessState onAction={() => void auth.logout()} />;
  }
  return (
    <AppShell
      incidentsCount={incidentsCount}
      ownerName={me.data?.name ?? cachedName}
      ownerLoading={me.isPending}
      onLogout={() => void auth.logout()}
      accountAlert={status.checks && status.tone !== 'ok' ? status.tone : undefined}
      accountRows={
        <>
          <SystemStatusSection status={status} />
          <ThemeToggle preview={previewAppearance} row={THEME_ROW} />
        </>
      }
      sidebarFooter={channelCard}
      moreExtra={
        <div className={styles.moreExtra}>
          <ChannelCard collapsed={false} />
        </div>
      }
    >
      <Outlet />
    </AppShell>
  );
}

/**
 * A reload restores the session in the background: the shell and the route skeleton show at once instead of a
 * full-screen «Проверяем вход…» (docs/design/README.md §6). Nothing that needs the session renders here.
 */
function RestoringLayout({ pathname }: { pathname: string }) {
  const title = titleFor(pathname);
  useDocumentTitle(title);
  return (
    <AppShell
      ownerName={readOwnerName()}
      ownerLoading
      sidebarFooter={
        <div className={styles.channelSpace} aria-hidden="true">
          <Skeleton width={28} height={28} radius="var(--radius-pill)" />
        </div>
      }
    >
      <RouteSkeleton pathname={pathname} title={title} />
    </AppShell>
  );
}

export function AppLayout() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const href = useRouterState({ select: (state) => state.location.href });
  const auth = useAuth();
  if (BARE_PATHS.includes(pathname)) return <Outlet />;

  switch (auth.status) {
    case 'checking':
      return <RestoringLayout pathname={pathname} />;
    case 'anonymous': {
      const back = auth.signedOutByUser || href === '/' ? {} : { redirect: href };
      return <Navigate to="/login" search={back} replace />;
    }
    case 'forbidden':
      return (
        <NoAccessState
          onAction={() => {
            auth.leaveForbidden();
          }}
        />
      );
    case 'unavailable':
      return <AuthUnavailableState error={auth.error} onRetry={auth.retry} />;
    case 'authenticated':
      return <SignedInLayout />;
  }
}
