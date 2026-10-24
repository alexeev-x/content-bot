import type { ReactNode } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import { Icon } from '../../../shared/ui';
import { copy } from './copy';
import styles from './Dashboard.module.css';
import { Widget } from './Widget';

type Props = {
  id: string;
  title: string;
  onOpenAll: () => void;
  children: ReactNode;
};

/** Frame of a content-analytics widget: the body comes from the page, the link leads to «Аналитика». */
export function AnalyticsWidget({ id, title, onOpenAll, children }: Props) {
  return (
    <Widget
      id={id}
      title={title}
      action={
        <AriaButton className={styles.more} onPress={onOpenAll}>
          {copy.analytics.all}
          <Icon name="chevron-right" size={16} />
        </AriaButton>
      }
    >
      {children}
    </Widget>
  );
}
