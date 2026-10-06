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
  /** A Button or link for the one recovery action. */
  action?: ReactNode;
  onDismiss?: () => void;
};

/** Persistent in-page message (a toast is never the only way to recover). The icon and the title carry the tone, not colour alone. */
export function Banner({ tone = 'info', title, children, action, onDismiss }: Props) {
  return (
    <div className={styles.banner} data-tone={tone} role={tone === 'error' || tone === 'conflict' ? 'alert' : 'status'}>
      <Icon name={ICONS[tone]} size={20} className={styles.icon} />
      <div className={styles.content}>
        <strong className={styles.title}>{title}</strong>
        {children ? <div className={styles.body}>{children}</div> : null}
        {action ? <div className={styles.action}>{action}</div> : null}
      </div>
      {onDismiss ? <IconButton label={ru.ui.close} icon="x" size="sm" showTooltip={false} onPress={onDismiss} /> : null}
    </div>
  );
}
