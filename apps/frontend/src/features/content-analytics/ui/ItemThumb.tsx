import type { ContentItemDto } from '@alexeev/contracts';
import { useState } from 'react';
import styles from './ContentAnalytics.module.css';
import { PlatformGlyph } from './PlatformGlyph';

type Props = { item: Pick<ContentItemDto, 'thumbnailUrl' | 'platform'>; size?: 'sm' | 'lg' };

/** The platform's own preview image; a missing or expired one falls back to the platform mark. */
export function ItemThumb({ item, size = 'sm' }: Props) {
  const [broken, setBroken] = useState(false);
  const className = size === 'lg' ? styles.thumbLg : styles.thumb;
  if (item.thumbnailUrl === null || broken) {
    return (
      <span className={className} data-empty="">
        <PlatformGlyph platform={item.platform} />
      </span>
    );
  }
  return (
    <span className={className}>
      <img
        src={item.thumbnailUrl}
        alt=""
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
      />
    </span>
  );
}
