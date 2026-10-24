import type { ReactNode } from 'react';
import { ru } from '../lib/ru';
import { Icon, type IconName } from './Icon';
import { IconButton } from './IconButton';
import styles from './Banner.module.css';

export type BannerTone = 'info' | 'warning' | 'error' | 'conflict';

const ICONS: Record<BannerTone, IconName> = { info: 'info', warning: 'alert', error: 'x-circle', conflict: 'conflict' };

type Props = {
  tone?: BannerTone;
  title: string;
  children?: ReactNode;
  /** The one recovery action, a visible Button (secondary, size sm on desktop); sits right of the text and wraps below it on narrow screens. */
  action?: ReactNode;
  onDismiss?: () => void;
  /** `sm`: a compact note inside a panel (less padding, smaller text). */
  size?: 'md' | 'sm';
};

/** Persistent in-page message (a toast is never the only way to recover). The icon and the title carry the tone, not colour alone. */
export function Banner({ tone = 'info', title, children, action, onDismiss, size = 'md' }: Props) {
  return (
    <div
      className={styles.banner}
      data-tone={tone}
      data-size={size}
      role={tone === 'error' || tone === 'conflict' ? 'alert' : 'status'}
    >
      <Icon name={ICONS[tone]} size={size === 'sm' ? 16 : 20} className={styles.icon} />
      <div className={styles.content}>
        <strong className={styles.title}>{title}</strong>
        {children ? <div className={styles.body}>{children}</div> : null}
      </div>
      {action ? <div className={styles.action}>{action}</div> : null}
      {onDismiss ? <IconButton label={ru.ui.close} icon="x" size="sm" showTooltip={false} onPress={onDismiss} /> : null}
    </div>
  );
}
