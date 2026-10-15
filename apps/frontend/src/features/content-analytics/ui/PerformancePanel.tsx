import type { ContentItemDto, ContentPlatform } from '@alexeev/contracts';
import type { CSSProperties } from 'react';
import { BarChart, Button, Icon, Panel } from '../../../shared/ui';
import { formatCount, formatDay, formatPublished, itemTitle, likesLabel, PLATFORM_LABEL } from '../model/format';
import { isSettled, median, PLATFORMS } from '../model/report';
import { PlatformLogo } from './PlatformLogo';
import styles from './Performance.module.css';

type Props = {
  items: readonly ContentItemDto[] | undefined;
  /** The report time: items younger than three days are drawn without «×». */
  at: number;
  platform: ContentPlatform | undefined;
  timezone: string;
  onOpen: (id: string) => void;
  /** «Все публикации» of one platform: the table, filtered. */
  onOpenAll: (platform: ContentPlatform) => void;
};

/** The newest publications drawn per platform; older ones are in the table. */
const LIMIT = 15;
const STRONG = 1.5;
const WEAK = 0.7;

/**
 * «Каждая публикация»: one bar per post or video in publishing order against its platform's median, with
 * the value above, «×» inside and the date under it; videos show their cover. Each platform has its own
 * scale (small multiples), since they differ by orders of magnitude.
 */
export function PerformancePanel({ items, at, platform, timezone, onOpen, onOpenAll }: Props) {
  const platforms = PLATFORMS.filter(
    (each) => (platform === undefined || platform === each) && (items ?? []).some((item) => item.platform === each)
  );
  return (
    <Panel title="Каждая публикация" headingLevel={2} quiet note="По порядку выхода, к медиане своей платформы">
      <div className={styles.body}>
        <ul className={styles.legend} aria-label="Обозначения">
          <li>
            <span className={styles.key} style={{ '--key': 'var(--color-accent)' } as CSSProperties} />
            Выше {STRONG.toLocaleString('ru-RU')}× медианы
          </li>
          <li>
            <span
              className={styles.key}
              style={
                { '--key': 'color-mix(in oklab, var(--color-accent) 45%, var(--color-surface-2))' } as CSSProperties
              }
            />
            В пределах нормы
          </li>
          <li>
            <span
              className={styles.key}
              style={
                { '--key': 'color-mix(in oklab, var(--color-accent) 18%, var(--color-surface-2))' } as CSSProperties
              }
            />
            Ниже обычного
          </li>
        </ul>
        {items === undefined ? (
          <div className={styles.skeleton} aria-hidden="true" />
        ) : platforms.length === 0 ? (
          <p className={styles.muted}>За период публикаций нет.</p>
        ) : (
          platforms.map((each) => {
            const own = items.filter((item) => item.platform === each && item.views !== null);
            // The median of settled items only: fresh ones are still collecting views.
            const usual = median(own.filter((item) => isSettled(item, at)).map((item) => item.views ?? 0)) ?? 0;
            const shown = [...own]
              .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
              .slice(0, LIMIT)
              .reverse();
            const video = each !== 'telegram';
            return (
              <section key={each} className={styles.section} aria-label={PLATFORM_LABEL[each]}>
                <header className={styles.head}>
                  <PlatformLogo platform={each} size={28} />
                  <h3 className={styles.name}>{PLATFORM_LABEL[each]}</h3>
                  <span className={styles.fact}>{own.length} публ.</span>
                  <span className={styles.fact}>
                    Медиана <strong>{formatCount(usual)}</strong>
                  </span>
                  <span className={styles.spacer} />
                  <Button size="sm" variant="secondary" onPress={() => onOpenAll(each)}>
                    Все публикации <Icon name="arrow-right" size={14} />
                  </Button>
                </header>
                <BarChart
                  label={`${PLATFORM_LABEL[each]}: просмотры ${shown.length} последних публикаций по порядку выхода, медиана ${formatCount(usual)}`}
                  bars={shown.map((item) => {
                    const young = !isSettled(item, at);
                    const multiple = usual > 0 && !young ? (item.views ?? 0) / usual : null;
                    const rounded = multiple === null ? null : Math.round(multiple * 10) / 10;
                    return {
                      id: item.id,
                      value: item.views ?? 0,
                      tone:
                        multiple === null
                          ? 'normal'
                          : multiple >= STRONG
                            ? 'strong'
                            : multiple < WEAK
                              ? 'weak'
                              : 'normal',
                      topLabel: formatCount(item.views),
                      ...(rounded === null ? {} : { insideLabel: `${rounded.toLocaleString('ru-RU')}×` }),
                      bottomLabel: formatDay(item.publishedAt.slice(0, 10)),
                      ...(video ? { image: item.thumbnailUrl } : {}),
                      title: itemTitle(item),
                      lines: [
                        formatPublished(item.publishedAt, timezone),
                        `${formatCount(item.views)} просмотров`,
                        young
                          ? 'Набирает просмотры: сравнение через 3 дня после выхода'
                          : rounded === null
                            ? ''
                            : `${rounded.toLocaleString('ru-RU')}× к медиане`,
                        item.likes === null ? '' : `${likesLabel(item.platform)}: ${formatCount(item.likes)}`
                      ].filter((line) => line !== '')
                    };
                  })}
                  reference={usual > 0 ? { value: usual, label: `Медиана ${formatCount(usual)}` } : undefined}
                  height={video ? 230 : 190}
                  onSelect={onOpen}
                />
              </section>
            );
          })
        )}
        <p className={styles.note}>
          <Icon name="info" size={14} /> Публикации моложе трёх дней ещё набирают просмотры: они без «×» и не входят в
          медиану.
        </p>
      </div>
    </Panel>
  );
}
