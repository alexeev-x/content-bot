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
  /** false while the section is only a «Раздел в разработке» stub: the route exists, but it is not offered in navigation. */
  built: boolean;
};

// Order and paths follow docs/PAGE_MAP.md § Primary navigation.
const ALL_NAV_ITEMS: readonly NavItem[] = [
  { to: '/', label: ru.nav.dashboard, icon: 'home', exact: true, primary: true, group: 'work', built: true },
  { to: '/posts', label: ru.nav.posts, icon: 'file', primary: true, group: 'work', built: true },
  { to: '/publications', label: ru.nav.publications, icon: 'send', primary: true, group: 'work', built: true },
  { to: '/calendar', label: ru.nav.calendar, icon: 'calendar', primary: true, group: 'work', built: false },
  { to: '/automations', label: ru.nav.automations, icon: 'zap', primary: false, group: 'system', built: false },
  { to: '/media', label: ru.nav.media, icon: 'image', primary: false, group: 'system', built: false },
  {
    to: '/incidents',
    label: ru.nav.incidents,
    icon: 'alert',
    primary: false,
    group: 'system',
    badge: 'incidents',
    built: false
  },
  { to: '/settings', label: ru.nav.settings, icon: 'settings', primary: false, group: 'system', built: true }
];

export const NAV_ITEMS: readonly NavItem[] = ALL_NAV_ITEMS.filter((item) => item.built);

/** Every top-level path, built or not: a stub section still counts as a root for Telegram's BackButton. */
export const NAV_ROOT_PATHS: readonly string[] = ALL_NAV_ITEMS.map((item) => item.to);

export const NAV_GROUP_ORDER: readonly NavGroupId[] = ['work', 'analytics', 'system'];
