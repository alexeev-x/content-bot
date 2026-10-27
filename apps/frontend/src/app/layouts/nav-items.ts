import type { IconName } from '../../shared/ui';
import { ru } from '../../shared/lib/ru';
import { isLabBuild } from '../environment';

export type NavItem = {
  to: string;
  label: string;
  icon: IconName;
  exact?: boolean;
  /** Primary items fill the bottom tab bar on narrow screens; the rest live in the «Ещё» sheet. */
  primary: boolean;
  badge?: 'incidents';
  /** Sidebar only: pinned at the bottom next to the account area instead of the list. */
  pinned?: boolean;
};

// Order and paths follow docs/PAGE_MAP.md § Primary navigation.
export const NAV_ITEMS: readonly NavItem[] = [
  { to: '/', label: ru.nav.dashboard, icon: 'home', exact: true, primary: true },
  { to: '/posts', label: ru.nav.posts, icon: 'file', primary: true },
  { to: '/publications', label: ru.nav.publications, icon: 'send', primary: true, badge: 'incidents' },
  { to: '/analytics', label: ru.nav.analytics, icon: 'chart', primary: false },
  // What the AI writes, learns and costs (owner, 20.10.2026: it outgrew Настройки → ИИ, which keeps only settings).
  { to: '/ai', label: ru.nav.ai, icon: 'sparkle', primary: false },
  { to: '/media', label: ru.nav.media, icon: 'image', primary: false },
  { to: '/sources', label: ru.nav.sources, icon: 'link', primary: false },
  // «Тестирование» (owner, 26.10.2026): DEV-only tools; a production build has neither the item nor the page.
  ...(isLabBuild() ? [{ to: '/lab', label: ru.nav.lab, icon: 'flask' as const, primary: false }] : []),
  { to: '/settings', label: ru.nav.settings, icon: 'settings', primary: false, pinned: true }
];

/** Every top-level path counts as a root for Telegram's BackButton. */
export const NAV_ROOT_PATHS: readonly string[] = NAV_ITEMS.map((item) => item.to);
