import type { ContentItemDto } from '@alexeev/contracts';
import { Button as AriaButton } from 'react-aria-components';
import { relativeTimeRu } from '../../../shared/lib/ru-format';
import { Carousel, Icon, Panel } from '../../../shared/ui';
import { formatCount, formatViews, itemTitle, PLATFORM_LABEL } from '../model/format';
import { crossPosted, median } from '../model/report';
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
        phoneRows={12.7}
      />
    );
  if (groups.length === 0) return null;
  // The one number the pairs answer: how much more the same video gets on TikTok than on YouTube.
  const ratios = groups.flatMap((group) => {
    const tiktok = group.find((item) => item.platform === 'tiktok')?.views;
    const youtube = group.find((item) => item.platform === 'youtube')?.views;
    return tiktok && youtube ? [tiktok / youtube] : [];
  });
  const ratio = median(ratios);
  return (
    <Panel title="Один ролик на платформах" headingLevel={2} quiet note="Совпадает название, вышли в пределах 4 дней">
      {ratio !== null ? (
        <p className={styles.crossVerdict}>
          {ratio >= 1
            ? `Один и тот же ролик в TikTok набирает в ${(Math.round(ratio * 10) / 10).toLocaleString('ru-RU')} раза больше, чем на YouTube`
            : `Один и тот же ролик на YouTube набирает в ${(Math.round((1 / ratio) * 10) / 10).toLocaleString('ru-RU')} раза больше, чем в TikTok`}{' '}
          (медиана по {ratios.length} {ratios.length === 1 ? 'паре' : 'парам'}).
        </p>
      ) : null}
      <div className={styles.crossCarousel}>
        <Carousel label="Ролики, вышедшие на нескольких платформах" minCard="md">
          {groups.map((group) => {
            const cover = group.find((item) => item.thumbnailUrl !== null) ?? group[0]!;
            return (
              <div key={group.map((item) => item.id).join('|')} className={styles.crossCard}>
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
              </div>
            );
          })}
        </Carousel>
      </div>
    </Panel>
  );
}
