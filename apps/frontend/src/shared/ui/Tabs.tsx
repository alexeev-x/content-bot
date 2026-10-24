import type { ReactNode } from 'react';
import {
  Tab as AriaTab,
  TabList as AriaTabList,
  TabPanel as AriaTabPanel,
  Tabs as AriaTabs,
  type TabListProps,
  type TabPanelProps,
  type TabProps,
  type TabsProps
} from 'react-aria-components';
import { Icon, type IconName } from './Icon';
import styles from './Tabs.module.css';

type TabsVariant = 'group' | 'card';

/**
 * APG tabs: arrows move between tabs (roving tabindex), Tab enters the panel. Compose Tabs > TabList > Tab + TabPanel.
 * `card`: equal-width bordered tiles, each with an icon square, a title and a hint (source pickers); pass `icon` and `hint` to Tab.
 */
export function Tabs({ variant = 'group', ...props }: Omit<TabsProps, 'className'> & { variant?: TabsVariant }) {
  return <AriaTabs {...props} data-variant={variant} className={styles.tabs} />;
}

export function TabList<T extends object>(props: Omit<TabListProps<T>, 'className'>) {
  return <AriaTabList {...props} className={styles.list} />;
}

type TabExtra = {
  children: ReactNode;
  /** Card variant: icon in the leading square. */
  icon?: IconName;
  /** Card variant: muted line under the title. */
  hint?: string;
};

export function Tab({ children, icon, hint, ...rest }: Omit<TabProps, 'className' | 'children'> & TabExtra) {
  return (
    <AriaTab {...rest} className={styles.tab}>
      {icon ? (
        <span className={styles.tabIcon} aria-hidden="true">
          <Icon name={icon} size={20} />
        </span>
      ) : null}
      {hint ? (
        <span className={styles.tabText}>
          <span className={styles.tabTitle}>{children}</span>
          <span className={styles.tabHint} title={hint}>
            {hint}
          </span>
        </span>
      ) : (
        children
      )}
    </AriaTab>
  );
}

export function TabPanel(props: Omit<TabPanelProps, 'className'>) {
  return <AriaTabPanel {...props} className={styles.panel} />;
}
