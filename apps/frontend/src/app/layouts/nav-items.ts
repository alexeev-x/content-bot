import type { IconName } from '../../shared/ui';
import { ru } from '../../shared/lib/ru';

export type NavGroupId = 'work' | 'analytics' | 'system';

export type NavItem = {
  to: string;
  label: string;
  icon: IconName;
  exact?: boolean;
  /** Primary items fill the bottom tab bar on narrow screens; the rest live in the «Ещё» sheet. */
  primary: boolean;
  /** Sidebar group; a group with no items is not rendered. */
  group: NavGroupId;
  badge?: 'incidents';
};

// Order and paths follow docs/PAGE_MAP.md § Primary navigation.
export const NAV_ITEMS: readonly NavItem[] = [
  { to: '/', label: ru.nav.dashboard, icon: 'home', exact: true, primary: true, group: 'work' },
  { to: '/posts', label: ru.nav.posts, icon: 'file', primary: true, group: 'work' },
  { to: '/publications', label: ru.nav.publications, icon: 'send', primary: true, group: 'work' },
  { to: '/calendar', label: ru.nav.calendar, icon: 'calendar', primary: true, group: 'work' },
  { to: '/automations', label: ru.nav.automations, icon: 'zap', primary: false, group: 'system' },
  { to: '/media', label: ru.nav.media, icon: 'image', primary: false, group: 'system' },
  { to: '/incidents', label: ru.nav.incidents, icon: 'alert', primary: false, group: 'system', badge: 'incidents' },
  { to: '/settings', label: ru.nav.settings, icon: 'settings', primary: false, group: 'system' }
];

export const NAV_GROUP_ORDER: readonly NavGroupId[] = ['work', 'analytics', 'system'];
