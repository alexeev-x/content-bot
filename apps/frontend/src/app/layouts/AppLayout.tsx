import { useQuery } from '@tanstack/react-query';
import { Navigate, Outlet, useRouterState } from '@tanstack/react-router';
import { useAuth } from '../auth';
import { ApiError } from '../../shared/api/http-client';
import { useTelegramChrome } from '../use-telegram-chrome';
import { ThemeToggle, useAppearanceSync } from '../../features/appearance';
import { AuthLoadingScreen, AuthUnavailableState, NoAccessState, meQueryOptions } from '../../features/auth';
import { ru } from '../../shared/lib/ru';
import { applyAppearance, useTheme, type Appearance } from '../theme';
import { useDocumentTitle } from '../use-document-title';
import { AppShell } from './AppShell';
import { NAV_ITEMS } from './nav-items';

// The sign-in page and the dev catalog use the full viewport: no navigation around them.
const BARE_PATHS = ['/login', '/__catalog'];

const applyServerAppearance = (value: Appearance) => applyAppearance(value);
// The theme button shows its result before the server confirms; only the server answer is persisted.
const previewAppearance = (value: Appearance) => applyAppearance(value, { persist: false });

function titleFor(pathname: string): string {
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
  useAppearanceSync(applyServerAppearance);
  // Follows the OS or Telegram scheme while the mode is «system».
  const { resolved } = useTheme();
  useTelegramChrome(resolved);
  useDocumentTitle(titleFor(pathname));

  if (me.error instanceof ApiError && me.error.status === 403) {
    return <NoAccessState onAction={() => void auth.logout()} />;
  }
  return (
    <AppShell
      ownerName={me.data?.name}
      onLogout={() => void auth.logout()}
      topBarTools={<ThemeToggle preview={previewAppearance} />}
    >
      <Outlet />
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
      return <AuthLoadingScreen label={ru.auth.checking} />;
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
