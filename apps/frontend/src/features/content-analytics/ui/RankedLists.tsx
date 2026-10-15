import type { ContentItemDto } from '@alexeev/contracts';
import { Button as AriaButton } from 'react-aria-components';
import { Panel, Skeleton } from '../../../shared/ui';
import { formatCount, PLATFORM_LABEL } from '../model/format';
import { copy } from './copy';
import { ItemThumb } from './ItemThumb';
import styles from './Report.module.css';

export type RankedItem = { item: ContentItemDto; multiple: number };

type Props = {
  best: readonly RankedItem[] | undefined;
  worst: readonly RankedItem[] | undefined;
  onOpen: (id: string) => void;
};

/** Leaders and laggards against their own platform's median, so a Telegram post and a video compare fairly. */
export function RankedLists({ best, worst, onOpen }: Props) {
  return (
    <div className={styles.pair}>
      <Panel title={copy.ranked.best} headingLevel={2} quiet note={copy.ranked.note}>
        <RankedList entries={best} onOpen={onOpen} tone="up" />
      </Panel>
      <Panel title={copy.ranked.worst} headingLevel={2} quiet note={copy.ranked.worstNote}>
        <RankedList entries={worst} onOpen={onOpen} tone="down" />
      </Panel>
    </div>
  );
}

function RankedList({
  entries,
  onOpen,
  tone
}: {
  entries: readonly RankedItem[] | undefined;
  onOpen: (id: string) => void;
  tone: 'up' | 'down';
}) {
  if (entries === undefined) {
    return (
      <ul className={styles.ranked} aria-hidden="true">
        {[0, 1, 2, 3, 4].map((key) => (
          <li key={key} className={styles.rankedSkeleton}>
            <Skeleton width="80%" height={14} />
          </li>
        ))}
      </ul>
    );
  }
  if (entries.length === 0) return <p className={styles.empty}>{copy.ranked.empty}</p>;
  return (
    <ul className={styles.ranked}>
      {entries.map(({ item, multiple }) => (
        <li key={item.id}>
          <AriaButton className={styles.rankedRow} onPress={() => onOpen(item.id)}>
            <ItemThumb item={item} />
            <span className={styles.rankedText}>
              <span className={styles.rankedTitle}>{item.title || copy.table.untitled}</span>
              <span className={styles.rankedMeta}>
                <span>{PLATFORM_LABEL[item.platform]}</span>
                <span>{formatCount(item.views)} просм.</span>
              </span>
            </span>
            <span className={styles.multipleBadge} data-tone={tone}>
              {multiple.toLocaleString('ru-RU')}×
            </span>
          </AriaButton>
        </li>
      ))}
    </ul>
  );
}
