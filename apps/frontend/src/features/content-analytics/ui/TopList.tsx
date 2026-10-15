import type { ContentItemDto } from '@alexeev/contracts';
import { Button as AriaButton } from 'react-aria-components';
import { Skeleton } from '../../../shared/ui';
import { formatCount, itemTitle } from '../model/format';
import { copy } from './copy';
import styles from './ContentAnalytics.module.css';
import { PlatformGlyph } from './PlatformGlyph';

type Props = {
  items: readonly ContentItemDto[] | undefined;
  limit?: number;
  onOpen: (id: string) => void;
};

/** Ranked list: the bar behind each row is its views against the leader, so the gap reads without numbers. */
export function TopList({ items, limit = 5, onOpen }: Props) {
  if (items === undefined) {
    return (
      <ol className={styles.top} aria-hidden="true">
        {Array.from({ length: limit }, (_, index) => (
          <li key={index} className={styles.topRowSkeleton}>
            <Skeleton width="70%" height={14} />
          </li>
        ))}
      </ol>
    );
  }
  const shown = items.slice(0, limit);
  if (shown.length === 0) {
    return (
      <div className={styles.quietBlock}>
        <p className={styles.quietTitle}>{copy.top.empty}</p>
        <p className={styles.tileNote}>{copy.top.emptyHint}</p>
      </div>
    );
  }
  const max = Math.max(1, ...shown.map((item) => item.views ?? 0));
  return (
    <ol className={styles.top}>
      {shown.map((item, index) => (
        <li key={item.id}>
          <AriaButton className={styles.topRow} onPress={() => onOpen(item.id)}>
            <span
              className={styles.topBar}
              style={{ inlineSize: `${Math.max(2, ((item.views ?? 0) / max) * 100)}%` }}
              aria-hidden="true"
            />
            <span className={styles.topRank}>{index + 1}</span>
            <PlatformGlyph platform={item.platform} />
            <span className={styles.topTitle}>{itemTitle(item)}</span>
            <span className={styles.topViews}>{formatCount(item.views)}</span>
          </AriaButton>
        </li>
      ))}
    </ol>
  );
}
