import type { ReactNode } from 'react';
import {
  Button,
  Disclosure as AriaDisclosure,
  DisclosureGroup as AriaDisclosureGroup,
  DisclosurePanel,
  Heading
} from 'react-aria-components';
import { Icon } from './Icon';
import styles from './Disclosure.module.css';

type Props = {
  id: string;
  title: ReactNode;
  /** Shown at the end of the header, e.g. a colour dot that summarises the collapsed content. */
  aside?: ReactNode;
  children: ReactNode;
};

/** A section that opens on demand (React Aria Disclosure): a heading button with aria-expanded, Enter/Space toggle. */
export function Disclosure({ id, title, aside, children }: Props) {
  return (
    <AriaDisclosure id={id} className={styles.disclosure}>
      <Heading level={3} className={styles.heading}>
        <Button slot="trigger" className={styles.trigger}>
          <Icon name="chevron-right" className={styles.chevron} />
          <span className={styles.title}>{title}</span>
          {aside}
        </Button>
      </Heading>
      <DisclosurePanel className={styles.panel}>{children}</DisclosurePanel>
    </AriaDisclosure>
  );
}

type GroupProps = {
  children: ReactNode;
  /** Several sections may stay open at once, so the owner can compare them. */
  allowsMultipleExpanded?: boolean;
  defaultExpandedKeys?: Iterable<string>;
  /** Controlled: lets a section load its content only once it is opened. */
  expandedKeys?: Iterable<string>;
  onExpandedChange?: (keys: Set<string>) => void;
};

export function DisclosureGroup({
  children,
  allowsMultipleExpanded = true,
  defaultExpandedKeys,
  expandedKeys,
  onExpandedChange
}: GroupProps) {
  return (
    <AriaDisclosureGroup
      className={styles.group}
      allowsMultipleExpanded={allowsMultipleExpanded}
      defaultExpandedKeys={defaultExpandedKeys}
      {...(expandedKeys === undefined ? {} : { expandedKeys })}
      {...(onExpandedChange === undefined
        ? {}
        : { onExpandedChange: (keys: Set<string | number>) => onExpandedChange(new Set([...keys].map(String))) })}
    >
      {children}
    </AriaDisclosureGroup>
  );
}
