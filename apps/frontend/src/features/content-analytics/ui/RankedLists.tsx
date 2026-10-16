import type { ContentItemDto } from '@alexeev/contracts';
import { Button as AriaButton } from 'react-aria-components';
import { Panel, Skeleton } from '../../../shared/ui';
import { formatViews, itemTitle, PLATFORM_LABEL } from '../model/format';
import { ItemCover } from './ItemCover';
import { PlatformGlyph } from './PlatformGlyph';
import styles from './Report.module.css';
import widgets from './Widgets.module.css';
import { PanelSkeleton } from './PanelSkeleton';

export type RankedItem = { item: ContentItemDto; multiple: number };

type Props = {
  best: readonly RankedItem[] | undefined;
  worst: readonly RankedItem[] | undefined;
  onOpen: (id: string) => void;
};

/** «Лучшие и худшие»: leaders and laggards against their own platform's median, side by side. */
export function RankedLists({ best, worst, onOpen }: Props) {
  if (best === undefined && worst === undefined)
    return (
      <PanelSkeleton
        title="Лучшие и худшие"
        note="Во сколько раз выше или ниже медианы своей платформы"
        rows={6.1}
        phoneRows={14.2}
      />
    );
  return (
    <Panel title="Лучшие и худшие" headingLevel={2} quiet note="Во сколько раз выше или ниже медианы своей платформы">
      <div className={styles.rankedPair}>
        <section aria-labelledby="ranked-best">
          <h3 id="ranked-best" className={styles.rankedHeading}>
            Лучшие
          </h3>
          <RankedList entries={best} onOpen={onOpen} tone="up" />
        </section>
        <section aria-labelledby="ranked-worst">
          <h3 id="ranked-worst" className={styles.rankedHeading}>
            Ниже обычного
          </h3>
          <RankedList entries={worst} onOpen={onOpen} tone="down" />
        </section>
      </div>
    </Panel>
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
  if (entries === undefined) return <Skeleton lines={4} height={40} />;
  if (entries.length === 0) return <p className={widgets.muted}>Пока нечего сравнивать.</p>;
  return (
    <ul className={styles.ranked}>
      {entries.map(({ item, multiple }) => (
        <li key={item.id}>
          <AriaButton className={styles.rankedRow} onPress={() => onOpen(item.id)}>
            <ItemCover item={item} size="sm" />
            <span className={styles.rankedText}>
              <span className={styles.rankedTitle} title={item.title || undefined}>
                {itemTitle(item)}
              </span>
              <span className={styles.rankedMeta}>
                <PlatformGlyph platform={item.platform} />
                <span>{PLATFORM_LABEL[item.platform]}</span>
                <span>{formatViews(item)} просм.</span>
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
