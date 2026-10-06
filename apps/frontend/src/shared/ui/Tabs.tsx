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
import styles from './Tabs.module.css';

/** APG tabs: arrows move between tabs (roving tabindex), Tab enters the panel. Compose Tabs > TabList > Tab + TabPanel. */
export function Tabs(props: Omit<TabsProps, 'className'>) {
  return <AriaTabs {...props} className={styles.tabs} />;
}

export function TabList<T extends object>(props: Omit<TabListProps<T>, 'className'>) {
  return <AriaTabList {...props} className={styles.list} />;
}

export function Tab({ children, ...rest }: Omit<TabProps, 'className' | 'children'> & { children: ReactNode }) {
  return (
    <AriaTab {...rest} className={styles.tab}>
      {children}
    </AriaTab>
  );
}

export function TabPanel(props: Omit<TabPanelProps, 'className'>) {
  return <AriaTabPanel {...props} className={styles.panel} />;
}
