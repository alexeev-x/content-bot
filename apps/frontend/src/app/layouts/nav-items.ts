import type { IconName } from '../../shared/ui';
import { ru } from '../../shared/lib/ru';

export type NavItem = {
  to: string;
  label: string;
  icon: IconName;
  exact?: boolean;
  /** Primary items fill the bottom tab bar on narrow screens; the rest live in the «Ещё» sheet. */
  primary: boolean;
  badge?: 'incidents';
};

// Order and paths follow docs/PAGE_MAP.md § Primary navigation.
export const NAV_ITEMS: readonly NavItem[] = [
  { to: '/', label: ru.nav.dashboard, icon: 'home', exact: true, primary: true },
  { to: '/posts', label: ru.nav.posts, icon: 'file', primary: true },
  { to: '/publications', label: ru.nav.publications, icon: 'send', primary: true },
  { to: '/calendar', label: ru.nav.calendar, icon: 'calendar', primary: true },
  { to: '/automations', label: ru.nav.automations, icon: 'zap', primary: false },
  { to: '/media', label: ru.nav.media, icon: 'image', primary: false },
  { to: '/incidents', label: ru.nav.incidents, icon: 'alert', primary: false, badge: 'incidents' },
  { to: '/settings', label: ru.nav.settings, icon: 'settings', primary: false }
];
