import type { ContentItemDto, ContentPlatform } from '@alexeev/contracts';
import { type CSSProperties, useState } from 'react';
import { BarChart, Button, Icon, Panel, SegmentedControl } from '../../../shared/ui';
import {
  formatCount,
  formatDay,
  formatPublished,
  formatViews,
  itemTitle,
  likesLabel,
  PLATFORM_LABEL
} from '../model/format';
import { isSettled, median, PLATFORMS, quantile } from '../model/report';
import { PlatformLogo } from './PlatformLogo';
import styles from './Performance.module.css';
import { PanelSkeleton } from './PanelSkeleton';

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
/** The «обычно» range needs this many settled publications to mean anything. */
const BAND_MIN_ITEMS = 4;
// On DEV two viral videos (163 тыс., 591 тыс.) flattened every other bar to a line. Where the top is over this many
// medians, heights go on a log scale; without such an outlier the plain scale keeps small differences visible.
const OUTLIER = 8;
const linear = (views: number) => views;
const logarithmic = (views: number) => Math.log10(views + 1);

/**
 * «Каждая публикация»: one bar per post or video in publishing order against its platform's median, with
 * the value above, «×» inside and the date under it; videos show their cover. Each platform has its own
 * scale (small multiples), since they differ by orders of magnitude.
 */
export function PerformancePanel({ items, at, platform, timezone, onOpen, onOpenAll }: Props) {
  const available = PLATFORMS.filter(
    (each) => (platform === undefined || platform === each) && (items ?? []).some((item) => item.platform === each)
  );
  // One platform at a time (owner, 20.10.2026: three charts in a row were one and a half phone screens).
  const [picked, setPicked] = useState<ContentPlatform | null>(null);
  const current = picked !== null && available.includes(picked) ? picked : (available[0] ?? null);
  const platforms = current === null ? [] : [current];
  if (items === undefined)
    return (
      <PanelSkeleton
        title="Каждая публикация"
        note="По порядку выхода, к медиане своей платформы"
        rows={9}
        phoneRows={11}
      />
    );
  return (
    <Panel title="Каждая публикация" headingLevel={2} quiet note="По порядку выхода, к медиане своей платформы">
      <div className={styles.body}>
        {available.length > 1 && current !== null ? (
          <SegmentedControl
            label="Платформа графика"
            options={available.map((each) => ({ id: each, label: PLATFORM_LABEL[each] }))}
            value={current}
            onChange={(id) => setPicked(id as ContentPlatform)}
          />
        ) : null}
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
          <li>
            <span className={styles.bandKey} />
            Обычно: средняя половина публикаций
          </li>
        </ul>
        {platforms.length === 0 ? (
          <p className={styles.muted}>За период публикаций нет.</p>
        ) : (
          platforms.map((each) => {
            const own = items.filter((item) => item.platform === each && item.views !== null);
            // The median of settled items only: fresh ones are still collecting views.
            const settledViews = own.filter((item) => isSettled(item, at)).map((item) => item.views ?? 0);
            const usual = median(settledViews) ?? 0;
            const low = settledViews.length >= BAND_MIN_ITEMS ? quantile(settledViews, 0.25) : null;
            const high = settledViews.length >= BAND_MIN_ITEMS ? quantile(settledViews, 0.75) : null;
            const shown = [...own]
              .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
              .slice(0, LIMIT)
              .reverse();
            const video = each !== 'telegram';
            const top = Math.max(0, ...shown.map((item) => item.views ?? 0));
            const height = usual > 0 && top / usual > OUTLIER ? logarithmic : linear;
            return (
              <section key={each} className={styles.section} aria-label={PLATFORM_LABEL[each]}>
                <header className={styles.head}>
                  <PlatformLogo platform={each} size={28} />
                  <h3 className={styles.name}>{PLATFORM_LABEL[each]}</h3>
                  <span className={styles.fact}>{own.length} публ.</span>
                  <span className={styles.fact}>
                    Медиана <strong>{formatCount(usual)}</strong>
                  </span>
                  {low !== null && high !== null ? (
                    <span className={styles.fact}>
                      Обычно{' '}
                      <strong>
                        {formatCount(low)}–{formatCount(high)}
                      </strong>
                    </span>
                  ) : null}
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
                      value: height(item.views ?? 0),
                      tone:
                        multiple === null
                          ? 'normal'
                          : multiple >= STRONG
                            ? 'strong'
                            : multiple < WEAK
                              ? 'weak'
                              : 'normal',
                      topLabel: formatViews(item),
                      ...(rounded === null ? {} : { insideLabel: `${rounded.toLocaleString('ru-RU')}×` }),
                      bottomLabel: formatDay(item.publishedAt.slice(0, 10)),
                      ...(video ? { image: item.thumbnailUrl } : {}),
                      title: itemTitle(item),
                      lines: [
                        formatPublished(item.publishedAt, timezone),
                        `${formatViews(item)} просмотров`,
                        young
                          ? 'Набирает просмотры: сравнение через 3 дня после выхода'
                          : rounded === null
                            ? ''
                            : `${rounded.toLocaleString('ru-RU')}× к медиане`,
                        item.likes === null ? '' : `${likesLabel(item.platform)}: ${formatCount(item.likes)}`
                      ].filter((line) => line !== '')
                    };
                  })}
                  band={
                    low !== null && high !== null
                      ? {
                          low: height(low),
                          high: height(high),
                          label: `Обычно ${formatCount(low)}–${formatCount(high)}`
                        }
                      : undefined
                  }
                  reference={usual > 0 ? { value: height(usual), label: `Медиана ${formatCount(usual)}` } : undefined}
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
