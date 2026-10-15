import type { ContentBaselineDto, ContentItemDto, ContentPlatform } from '@alexeev/contracts';
import { useQueries } from '@tanstack/react-query';
import { type CSSProperties, useMemo, useState } from 'react';
import { IconButton, LineChart, Panel, Select } from '../../../shared/ui';
import { contentItemQueryOptions } from '../api/content-analytics-queries';
import { ageCurve, baselineCurve } from '../model/curves';
import { formatCount, formatPublished, PLATFORM_LABEL } from '../model/format';
import { multipleOf } from '../model/report';
import { ItemCover } from './ItemCover';
import styles from './Widgets.module.css';

const COLORS = ['var(--color-accent)', 'var(--color-series-2)', 'var(--color-series-3)', 'var(--color-series-4)'];
const MAX = 4;
const HORIZON = 48;

type Props = {
  items: readonly ContentItemDto[] | undefined;
  baselines: readonly ContentBaselineDto[];
  medians: Partial<Record<ContentPlatform, number | null>>;
  timezone: string;
  onOpen: (id: string) => void;
};

/** «Сравнение роликов»: up to four items on one axis of hours since publishing, with the usual curve. */
export function CompareVideosPanel({ items, baselines, medians, timezone, onOpen }: Props) {
  const sorted = useMemo(
    () => [...(items ?? [])].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)),
    [items]
  );
  const [picked, setPicked] = useState<string[] | null>(null);
  // By default the two newest videos (not Telegram posts): the comparison the owner makes most.
  const ids =
    picked ??
    sorted
      .filter((item) => item.platform !== 'telegram')
      .slice(0, 2)
      .map((item) => item.id);
  const chosen = ids
    .map((id) => sorted.find((item) => item.id === id))
    .filter((item): item is ContentItemDto => !!item);
  const details = useQueries({ queries: chosen.map((item) => contentItemQueryOptions(item.id)) });
  const platform = chosen[0]?.platform;
  const usual = baselineCurve(
    baselines.find((entry) => entry.platform === platform),
    HORIZON
  );

  const series = chosen.flatMap((item, index) => {
    const detail = details[index]?.data;
    const points = detail ? ageCurve(detail, HORIZON) : [];
    return points.length > 1
      ? [
          {
            id: item.id,
            label: item.title || 'Без текста',
            points,
            color: COLORS[index] ?? COLORS[0]!,
            area: index === 0
          }
        ]
      : [];
  });
  const options = sorted
    .filter((item) => !ids.includes(item.id))
    .slice(0, 50)
    .map((item) => ({ id: item.id, label: `${PLATFORM_LABEL[item.platform]}: ${item.title || 'Без текста'}` }));

  return (
    <Panel title="Сравнение роликов" headingLevel={2} quiet note="На одинаковом возрасте публикации, до 4 штук">
      <div className={styles.body}>
        <div className={styles.picks}>
          {chosen.map((item, index) => (
            <span key={item.id} className={styles.pick}>
              <span className={styles.dot} style={{ '--swatch': COLORS[index] } as CSSProperties} />
              <span>{item.title || 'Без текста'}</span>
              <IconButton
                icon="x"
                label={`Убрать «${item.title || 'Без текста'}» из сравнения`}
                size="sm"
                onPress={() => setPicked(ids.filter((id) => id !== item.id))}
              />
            </span>
          ))}
          {ids.length < MAX && options.length > 0 ? (
            <Select
              label="Добавить ролик"
              inlineLabel
              placeholder="Выберите"
              options={options}
              value={null}
              onChange={(id) => setPicked([...ids, id])}
            />
          ) : null}
        </div>
        {series.length === 0 ? (
          <p className={styles.muted}>
            Кривые появятся у публикаций, которые отслеживаются с первых часов. Старые ролики отслеживаются только раз в
            день.
          </p>
        ) : (
          <LineChart
            label="Просмотры выбранных роликов по часам после публикации"
            series={[
              ...series,
              ...(usual.length > 1
                ? [
                    {
                      id: 'usual',
                      label: `Медиана ${platform ? PLATFORM_LABEL[platform] : ''}`,
                      points: usual,
                      color: 'var(--color-chart-muted)',
                      dashed: true
                    }
                  ]
                : [])
            ]}
            formatX={(x) => `+${Math.round(x)} ч`}
            formatY={formatCount}
            xTicks={[1, 6, 12, 24, 48]}
            height={260}
          />
        )}
        <div className={styles.cards}>
          {chosen.map((item, index) => {
            const multiple = multipleOf(item, medians);
            return (
              <button key={item.id} type="button" className={styles.card} onClick={() => onOpen(item.id)}>
                <span className={styles.row} style={{ padding: 0, cursor: 'inherit' }}>
                  <ItemCover item={item} size="sm" />
                  <span className={styles.text}>
                    <span className={styles.title}>
                      <span
                        className={styles.dot}
                        style={{ '--swatch': COLORS[index], display: 'inline-block', marginRight: 6 } as CSSProperties}
                      />
                      {item.title || 'Без текста'}
                    </span>
                    <span className={styles.meta}>
                      {PLATFORM_LABEL[item.platform]}, {formatPublished(item.publishedAt, timezone)}
                    </span>
                  </span>
                  <span />
                </span>
                <dl className={styles.cardStats}>
                  <div>
                    <dt>Просмотры</dt>
                    <dd>{formatCount(item.views)}</dd>
                  </div>
                  <div>
                    <dt>К медиане</dt>
                    <dd className={multiple === null ? undefined : multiple >= 1 ? styles.up : styles.down}>
                      {multiple === null ? '—' : `${multiple.toLocaleString('ru-RU')}×`}
                    </dd>
                  </div>
                  <div>
                    <dt>Лайки</dt>
                    <dd>{formatCount(item.likes)}</dd>
                  </div>
                </dl>
              </button>
            );
          })}
        </div>
      </div>
    </Panel>
  );
}
