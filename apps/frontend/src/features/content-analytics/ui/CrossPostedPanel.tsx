import type { ContentItemDto } from '@alexeev/contracts';
import { Button as AriaButton } from 'react-aria-components';
import { relativeTimeRu } from '../../../shared/lib/ru-format';
import { Icon, Panel } from '../../../shared/ui';
import { formatCount, formatViews, itemTitle, PLATFORM_LABEL } from '../model/format';
import { crossPosted } from '../model/report';
import { ItemCover } from './ItemCover';
import { PlatformLogo } from './PlatformLogo';
import styles from './Audience.module.css';
import { PanelSkeleton } from './PanelSkeleton';

type Props = {
  items: readonly ContentItemDto[] | undefined;
  now: number;
  onOpen: (id: string) => void;
};

/**
 * «Один ролик на платформах»: the same video published on several platforms side by side. Matched by the
 * start of the title within four days, so a renamed copy is not found; nothing is shown without a match.
 */
export function CrossPostedPanel({ items, now, onOpen }: Props) {
  const groups = crossPosted(items ?? []);
  if (items === undefined)
    return (
      <PanelSkeleton
        title="Один ролик на платформах"
        note="Совпадает название, вышли в пределах 4 дней"
        rows={6.4}
        phoneRows={13}
      />
    );
  if (groups.length === 0) return null;
  return (
    <Panel title="Один ролик на платформах" headingLevel={2} quiet note="Совпадает название, вышли в пределах 4 дней">
      <ul className={styles.cross}>
        {groups.map((group) => {
          const cover = group.find((item) => item.thumbnailUrl !== null) ?? group[0]!;
          return (
            <li key={group.map((item) => item.id).join('|')} className={styles.crossCard}>
              <div className={styles.crossHead}>
                <ItemCover item={cover} />
                <span className={styles.crossTitle}>
                  <span title={cover.title}>{itemTitle(cover)}</span>
                  <span className={styles.note}>{relativeTimeRu(cover.publishedAt, now)}</span>
                </span>
              </div>
              <ul className={styles.crossRows}>
                {group.map((item) => (
                  <li key={item.id}>
                    <AriaButton className={styles.crossRow} onPress={() => onOpen(item.id)}>
                      <PlatformLogo platform={item.platform} size={18} />
                      <span className={styles.srOnly}>{PLATFORM_LABEL[item.platform]}: </span>
                      <span className={styles.crossFigure}>
                        <Icon name="eye" size={13} /> {formatViews(item)}
                      </span>
                      <span className={styles.crossFigure}>
                        <Icon name="heart" size={13} /> {formatCount(item.likes)}
                      </span>
                      <span className={styles.crossFigure}>
                        <Icon name="message" size={13} /> {formatCount(item.comments)}
                      </span>
                    </AriaButton>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
