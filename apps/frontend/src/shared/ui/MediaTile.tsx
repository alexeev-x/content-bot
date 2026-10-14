import { useState, type CSSProperties } from 'react';
import { LoadingImage } from './LoadingImage';
import { Icon, type IconName } from './Icon';
import styles from './MediaTile.module.css';

type Props = {
  /** Image URL; without it (or when it fails) the same tile shows the type icon, so a row never changes height. */
  src?: string | undefined;
  /** Box side in px: 40 desktop rows, 44 phone rows, 32 compact tables. */
  size?: 32 | 40 | 44 | 48;
  icon?: IconName;
};

/** Leading thumbnail of a list row. Decorative: the row title already names the item. */
export function MediaTile({ src, size = 40, icon = 'file' }: Props) {
  const [failed, setFailed] = useState<string | undefined>(undefined);
  const showImage = Boolean(src) && failed !== src;
  const style = { '--tile': `${size}px` } as CSSProperties;
  return (
    <span className={styles.tile} style={style} data-image={showImage || undefined} aria-hidden="true">
      {showImage ? (
        <LoadingImage src={src ?? ''} alt="" loading="lazy" decoding="async" onError={() => setFailed(src)} />
      ) : (
        <Icon name={icon} size={size >= 40 ? 20 : 16} />
      )}
    </span>
  );
}
