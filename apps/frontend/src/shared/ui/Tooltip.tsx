import type { ReactNode } from 'react';
import { Tooltip as AriaTooltip, TooltipTrigger } from 'react-aria-components';
import styles from './Tooltip.module.css';

type Props = {
  content: ReactNode;
  /** One focusable React Aria element (Button, IconButton, Link...). */
  children: ReactNode;
  delay?: number;
};

/** Supplementary hint on hover and keyboard focus; never the only place where required information lives. */
export function Tooltip({ content, children, delay = 400 }: Props) {
  return (
    <TooltipTrigger delay={delay} closeDelay={80}>
      {children}
      <AriaTooltip className={styles.tooltip} offset={8}>
        {content}
      </AriaTooltip>
    </TooltipTrigger>
  );
}
