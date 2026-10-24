import type { ContentItemDto } from '@alexeev/contracts';
import { useState } from 'react';
import { PlatformGlyph } from './PlatformGlyph';
import styles from './Widgets.module.css';

type Props = { item: Pick<ContentItemDto, 'thumbnailUrl' | 'platform'>; size?: 'sm' | 'md' };

/** A publication's cover; an expired or missing one shows the platform mark instead. */
export function ItemCover({ item, size = 'md' }: Props) {
  const [broken, setBroken] = useState(false);
  return (
    <span className={styles.cover} data-size={size}>
      {item.thumbnailUrl === null || broken ? (
        <PlatformGlyph platform={item.platform} />
      ) : (
        <img
          src={item.thumbnailUrl}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setBroken(true)}
        />
      )}
    </span>
  );
}
