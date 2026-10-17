import { Icon, type IconName } from './Icon';
import type { StatusGroup } from './status-meta';
import styles from './IconBadge.module.css';

type Props = {
  name: IconName;
  tone?: StatusGroup | 'accent';
  size?: 'sm' | 'md' | 'lg';
};

const ICON_SIZE = { sm: 16, md: 20, lg: 24 } as const;

/** A decorative icon on a tinted square: the mark of a card or a settings row. Always beside a text label. */
export function IconBadge({ name, tone = 'accent', size = 'md' }: Props) {
  return (
    <span className={styles.badge} data-tone={tone} data-size={size} aria-hidden="true">
      <Icon name={name} size={ICON_SIZE[size]} />
    </span>
  );
}
