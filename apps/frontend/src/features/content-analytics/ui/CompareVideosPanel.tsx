import type { ContentBaselineDto, ContentItemDetailDto, ContentItemDto, ContentPlatform } from '@alexeev/contracts';
import { useQueries } from '@tanstack/react-query';
import { type CSSProperties, useMemo, useState } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import {
  Carousel,
  AreaChart,
  Button,
  Dialog,
  IconButton,
  LineChart,
  Panel,
  SearchField,
  SegmentedControl,
  Skeleton,
  VisuallyHidden
} from '../../../shared/ui';
import { contentItemQueryOptions } from '../api/content-analytics-queries';
import { ageCurve, baselineCurve } from '../model/curves';
import { formatCount, formatPublished, formatViews, itemTitle, PLATFORM_LABEL } from '../model/format';
import { median } from '../model/report';
import { usualAt } from '../model/status';
import { ItemCover } from './ItemCover';
import { PlatformGlyph } from './PlatformGlyph';
import styles from './Compare.module.css';
import { PanelSkeleton } from './PanelSkeleton';

const COLORS = ['var(--color-accent)', 'var(--color-series-2)', 'var(--color-series-3)', 'var(--color-series-4)'];
const MAX = 4;
const MODES = [
  { id: 'views', label: 'Просмотры' },
  { id: 'index', label: 'К обычному' }
] as const;
const HORIZONS = [
  { id: '24', label: '24 ч' },
  { id: '48', label: '48 ч' },
  { id: '72', label: '72 ч' }
] as const;

type Props = {
  items: readonly ContentItemDto[] | undefined;
  /** Ids of items tracked from their first hours: only they have comparable early curves. */
  tracked: readonly string[];
  baselines: readonly ContentBaselineDto[];
  timezone: string;
  /** Chosen items, kept in the page URL; undefined means the default pair. */
  picked: readonly string[] | undefined;
  onPickedChange: (ids: string[]) => void;
  onOpen: (id: string) => void;
};

function viewsAt(curve: readonly { x: number; y: number }[], hours: number): number | null {
  const last = curve.at(-1);
  if (!last || last.x < hours) return null;
  for (let index = 1; index < curve.length; index += 1) {
    const a = curve[index - 1]!;
    const b = curve[index]!;
    if (hours <= b.x) return Math.round(a.y + ((b.y - a.y) * (hours - a.x)) / (b.x - a.x || 1));
  }
  return last.y;
}

/**
 * «Сравнение роликов»: up to four items on one axis of hours since publishing. «Просмотры» compares raw
 * counts (with the usual curve when all share a platform); «К обычному» divides each by its own platform's
 * usual curve, so a Telegram post and a video compare fairly.
 */
export function CompareVideosPanel({ items, tracked, baselines, timezone, picked, onPickedChange, onOpen }: Props) {
  const trackedSet = useMemo(() => new Set(tracked), [tracked]);
  const sorted = useMemo(
    () => [...(items ?? [])].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)),
    [items]
  );
  const [mode, setMode] = useState<'views' | 'index'>('views');
  const [horizon, setHorizon] = useState<'24' | '48' | '72'>('48');
  const [choosing, setChoosing] = useState(false);
  // By default the two newest items that have early readings: a comparison that can actually be drawn.
  const ids: readonly string[] =
    picked ??
    sorted
      .filter((item) => trackedSet.has(item.id))
      .slice(0, 2)
      .map((item) => item.id);
  const chosen = ids
    .map((id) => sorted.find((item) => item.id === id))
    .filter((item): item is ContentItemDto => !!item);
  const details = useQueries({ queries: chosen.map((item) => contentItemQueryOptions(item.id)) });
  const hours = Number(horizon);
  const platforms = new Set(chosen.map((item) => item.platform));
  const mixed = platforms.size > 1;
  const single = platforms.size === 1 ? chosen[0]?.platform : undefined;
  const baselineOf = (platform: ContentPlatform) => baselines.find((entry) => entry.platform === platform);

  const rows = chosen.map((item, index) => {
    const detail: ContentItemDetailDto | undefined = details[index]?.data;
    const curve = detail ? ageCurve(detail, hours) : [];
    const full = detail ? ageCurve(detail) : [];
    const at24 = viewsAt(full, 24);
    const usual24 = usualAt(baselineOf(item.platform), 24);
    const peers = (items ?? []).filter((entry) => entry.platform === item.platform);
    const scale = (value: number | null, hours: number): number | null => {
      if (value === null || !mixed) return value;
      const usual = usualAt(baselineOf(item.platform), hours);
      return usual ? value / usual : null;
    };
    const medianOf = (pick: (entry: ContentItemDto) => number | null) =>
      median(peers.map(pick).filter((value): value is number => value !== null));
    // Views gained in each hour of the horizon: the shape of the start.
    const hourly = Array.from({ length: hours }, (_, hour) => {
      const a = viewsAt(full, hour) ?? null;
      const b = viewsAt(full, hour + 1) ?? null;
      return a === null || b === null ? 0 : Math.max(0, b - a);
    });
    return {
      item,
      color: COLORS[index] ?? COLORS[0]!,
      curve,
      hourly,
      // Across platforms raw counts are not comparable: each reading becomes «× its platform's usual».
      at6: scale(viewsAt(full, 6), 6),
      at24: scale(at24, 24),
      at48: scale(viewsAt(full, 48), 48),
      at72: viewsAt(full, 72),
      // Raw counts for the head-to-head facts: the same hour of life, whatever the platform.
      raw: (age: number) => viewsAt(full, age),
      reach: full.at(-1)?.x ?? 0,
      usual: {
        views: medianOf((entry) => entry.views),
        likes: medianOf((entry) => entry.likes),
        comments: medianOf((entry) => entry.comments)
      },
      vsUsual: at24 !== null && usual24 ? Math.round((at24 / usual24) * 10) / 10 : null,
      loading: details[index]?.isPending ?? false
    };
  });

  const differences = keyDifferences(rows, mixed, hours);

  const series = rows.flatMap((row, index) => {
    const points =
      mode === 'views'
        ? row.curve
        : row.curve
            .filter((point) => point.x >= 1)
            .flatMap((point) => {
              const usual = usualAt(baselineOf(row.item.platform), point.x);
              return usual ? [{ x: point.x, y: Math.round((point.y / usual) * 100) / 100 }] : [];
            });
    return points.length > 1
      ? [
          {
            id: row.item.id,
            // The same video on two platforms has one title: the platform tells the lines apart.
            label: `${PLATFORM_LABEL[row.item.platform]} · ${itemTitle(row.item)}`,
            points,
            color: row.color,
            area: index === 0 && mode === 'views'
          }
        ]
      : [];
  });
  const usualCurve = mode === 'views' && single ? baselineCurve(baselineOf(single), hours) : [];
  const reference =
    mode === 'index'
      ? [
          {
            id: 'one',
            label: 'Обычный уровень (1×)',
            points: [
              { x: 1, y: 1 },
              { x: hours, y: 1 }
            ],
            color: 'var(--color-chart-muted)',
            dashed: true
          }
        ]
      : usualCurve.length > 1
        ? [
            {
              id: 'usual',
              label: `Обычная медиана ${single ? PLATFORM_LABEL[single] : ''}`,
              points: usualCurve,
              color: 'var(--color-chart-muted)',
              dashed: true
            }
          ]
        : [];

  if (items === undefined)
    return (
      <PanelSkeleton
        title="Сравнение роликов"
        note="На одинаковом возрасте после публикации"
        rows={12.5}
        phoneRows={31.6}
      />
    );
  return (
    <Panel
      title="Сравнение роликов"
      headingLevel={2}
      quiet
      note="На одинаковом возрасте после публикации"
      action={
        <div className={styles.controls}>
          <SegmentedControl
            label="Что сравнивать"
            options={MODES}
            value={mode}
            onChange={(id) => setMode(id as typeof mode)}
          />
          <SegmentedControl
            label="Горизонт"
            options={HORIZONS}
            value={horizon}
            onChange={(id) => setHorizon(id as typeof horizon)}
          />
        </div>
      }
    >
      <div className={styles.body}>
        <ul className={styles.picks}>
          {rows.map((row) => (
            <li key={row.item.id} className={styles.pick}>
              <span className={styles.swatch} style={{ '--swatch': row.color } as CSSProperties} />
              <PlatformGlyph platform={row.item.platform} size={14} />
              <span className={styles.pickTitle} title={row.item.title || undefined}>
                {PLATFORM_LABEL[row.item.platform]} · {itemTitle(row.item)}
              </span>
              <IconButton
                icon="x"
                size="sm"
                label={`Убрать «${itemTitle(row.item)}» из сравнения`}
                onPress={() => onPickedChange(ids.filter((id) => id !== row.item.id))}
              />
            </li>
          ))}
          {ids.length < MAX ? (
            <li>
              <Button size="sm" variant="secondary" icon="plus" onPress={() => setChoosing(true)}>
                Добавить ролик
              </Button>
            </li>
          ) : null}
        </ul>

        {chosen.length === 0 ? (
          <p className={styles.muted}>
            Выберите ролики. Сравнивать по часам можно те, что отслеживаются с первых часов после выхода — новые
            публикации попадают сюда автоматически.
          </p>
        ) : series.length === 0 && rows.some((row) => row.loading) ? (
          // The chart's own height while the hourly series load, so the cards below stay where they will be.
          <div className={styles.chartRow} aria-busy="true">
            <div className={styles.chartCell}>
              <VisuallyHidden>Загружаем замеры…</VisuallyHidden>
              <Skeleton height={260} />
            </div>
          </div>
        ) : series.length === 0 ? (
          <p className={styles.muted}>
            У выбранных роликов нет замеров первых часов: они вышли до начала отслеживания. Выберите отмеченные «с
            первых часов».
          </p>
        ) : (
          <div className={styles.chartRow}>
            <div className={styles.chartCell}>
              <LineChart
                label={
                  mode === 'views'
                    ? 'Просмотры по часам после публикации'
                    : 'Просмотры к обычному по часам после публикации'
                }
                series={[...series, ...reference]}
                formatX={(x) => `${Math.round(x)} ч`}
                formatY={
                  mode === 'views' ? formatCount : (y) => `${(Math.round(y * 10) / 10).toLocaleString('ru-RU')}×`
                }
                xTicks={hours === 24 ? [0, 6, 12, 18, 24] : hours === 48 ? [0, 6, 12, 24, 48] : [0, 12, 24, 48, 72]}
                height={260}
              />
            </div>
            {differences.length > 0 ? (
              <aside className={styles.differences} aria-labelledby="compare-differences">
                <h3 id="compare-differences" className={styles.differencesTitle}>
                  Ключевые отличия
                </h3>
                <ol className={styles.differenceList}>
                  {differences.map((difference) => (
                    <li key={difference.title}>
                      <strong>{difference.title}</strong>
                      <span>{difference.detail}</span>
                    </li>
                  ))}
                </ol>
              </aside>
            ) : null}
          </div>
        )}

        {rows.length > 0 ? (
          // A swipeable strip on a phone: two or three detail cards stacked were a screen and a half (20.10.2026).
          <Carousel label="Карточки сравниваемых публикаций" minCard="md">
            {rows.map((row) => {
              const strength = strengthOf(row, rows, mixed);
              return (
                <article key={row.item.id} className={styles.card} style={{ '--swatch': row.color } as CSSProperties}>
                  <AriaButton className={styles.cardHead} onPress={() => onOpen(row.item.id)}>
                    <ItemCover item={row.item} size="sm" />
                    <span className={styles.cardTitle}>
                      <span>
                        <span className={styles.swatch} />
                        {itemTitle(row.item)}
                      </span>
                      <span className={styles.cardMeta}>
                        {PLATFORM_LABEL[row.item.platform]}, {formatPublished(row.item.publishedAt, timezone)}
                      </span>
                    </span>
                  </AriaButton>
                  <dl className={styles.metrics}>
                    <Metric label="Просмотры" value={row.item.views} usual={row.usual.views} />
                    <Metric label="Лайки" value={row.item.likes} usual={row.usual.likes} />
                    <Metric label="Комментарии" value={row.item.comments} usual={row.usual.comments} />
                    <div>
                      <dt>К обычному на 24 ч</dt>
                      <dd
                        data-tone={
                          row.vsUsual === null
                            ? 'flat'
                            : row.vsUsual >= 1.5
                              ? 'up'
                              : row.vsUsual <= 0.7
                                ? 'down'
                                : 'flat'
                        }
                      >
                        {row.vsUsual === null ? '—' : `${row.vsUsual.toLocaleString('ru-RU')}×`}
                      </dd>
                    </div>
                  </dl>
                  <p className={styles.cardMeta}>
                    Проценты — к медиане ваших публикаций в {PLATFORM_LABEL[row.item.platform]} за период
                  </p>
                  {row.hourly.some((value) => value > 0) ? (
                    <div className={styles.hourly}>
                      <span className={styles.cardMeta}>Прирост просмотров по часам</span>
                      <AreaChart
                        points={row.hourly}
                        variant="bars"
                        color={row.color}
                        height={36}
                        tips={row.hourly.map((value, hour) => `${hour + 1} ч: +${formatCount(value)}`)}
                      />
                    </div>
                  ) : null}
                  {strength ? <p className={styles.strength}>{strength}</p> : null}
                </article>
              );
            })}
          </Carousel>
        ) : null}
      </div>

      <PickDialog
        isOpen={choosing}
        onOpenChange={setChoosing}
        items={sorted}
        tracked={trackedSet}
        exclude={ids}
        timezone={timezone}
        onPick={(id) => {
          onPickedChange([...ids, id]);
          setChoosing(false);
        }}
      />
    </Panel>
  );
}

function PickDialog({
  isOpen,
  onOpenChange,
  items,
  tracked,
  exclude,
  timezone,
  onPick
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  items: readonly ContentItemDto[];
  tracked: ReadonlySet<string>;
  exclude: readonly string[];
  timezone: string;
  onPick: (id: string) => void;
}) {
  const [search, setSearch] = useState('');
  const needle = search.trim().toLocaleLowerCase('ru-RU');
  const list = items
    .filter((item) => !exclude.includes(item.id))
    .filter((item) => needle === '' || item.title.toLocaleLowerCase('ru-RU').includes(needle))
    .sort((a, b) => Number(tracked.has(b.id)) - Number(tracked.has(a.id)))
    .slice(0, 40);
  return (
    <Dialog isOpen={isOpen} onOpenChange={onOpenChange} title="Добавить ролик в сравнение" size="wide">
      <div className={styles.dialog}>
        <SearchField label="Поиск по названию" placeholder="Поиск по названию…" value={search} onChange={setSearch} />
        {list.length === 0 ? (
          <p className={styles.muted}>Ничего не найдено.</p>
        ) : (
          <ul className={styles.choices}>
            {list.map((item) => (
              <li key={item.id}>
                <AriaButton className={styles.choice} onPress={() => onPick(item.id)}>
                  <ItemCover item={item} size="sm" />
                  <span className={styles.choiceText}>
                    <span className={styles.choiceTitle}>{itemTitle(item)}</span>
                    <span className={styles.choiceMeta}>
                      <PlatformGlyph platform={item.platform} withLabel size={14} />
                      {formatPublished(item.publishedAt, timezone)}, {formatViews(item)} просм.
                    </span>
                  </span>
                  <span className={styles.choiceTag} data-tracked={tracked.has(item.id) || undefined}>
                    {tracked.has(item.id) ? 'с первых часов' : 'без ранних замеров'}
                  </span>
                </AriaButton>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Dialog>
  );
}

type Row = {
  item: ContentItemDto;
  at6: number | null;
  at24: number | null;
  at48: number | null;
  raw: (age: number) => number | null;
  /** The oldest hour of life the readings reach. */
  reach: number;
  usual: { views: number | null; likes: number | null; comments: number | null };
};

function percent(a: number, b: number): number {
  return Math.round(((a - b) / b) * 100);
}

function ratio(a: number, b: number): string {
  return (Math.round((a / b) * 10) / 10).toLocaleString('ru-RU');
}

/** How a row is named in a sentence: its platform when another row has the same title, else its title. */
function nameOf(row: Row, rows: readonly Row[]): string {
  const title = itemTitle(row.item);
  const twin = rows.some((other) => other !== row && itemTitle(other.item).slice(0, 20) === title.slice(0, 20));
  if (twin) return PLATFORM_LABEL[row.item.platform];
  return title.length > 28 ? `«${title.slice(0, 27)}…»` : `«${title}»`;
}

/** Per 1000 views: reactions of a big and a small video compare only as a rate. */
/** A rate below 10 keeps one decimal: «0,4 против 1,2», not «0 против 1». */
function rateText(rate: number): string {
  return rate < 10 ? (Math.round(rate * 10) / 10).toLocaleString('ru-RU') : formatCount(Math.round(rate));
}

function per1000(value: number | null, views: number | null): number | null {
  return value === null || views === null || views < 100 ? null : (value / views) * 1000;
}

/**
 * What actually separates the compared items, in plain words: head to head on the same hour of life and
 * per 1000 views, so it works across platforms without their usual curves; only the facts the readings support.
 */
function keyDifferences(rows: readonly Row[], mixed: boolean, horizon: number): { title: string; detail: string }[] {
  const result: { title: string; detail: string }[] = [];
  // Views on the oldest hour every compared item has reached, within the chosen horizon.
  const age = Math.min(horizon, ...rows.map((row) => Math.floor(row.reach)));
  const atAge = rows
    .map((row) => ({ row, views: age >= 1 ? row.raw(age) : null }))
    .filter((entry): entry is { row: Row; views: number } => entry.views !== null && entry.views > 0)
    .sort((a, b) => b.views - a.views);
  if (atAge.length >= 2) {
    const [first, last] = [atAge[0]!, atAge.at(-1)!];
    if (first.views >= last.views * 1.15) {
      result.push({
        title: `${nameOf(first.row, rows)}: в ${ratio(first.views, last.views)} раза больше просмотров к ${age} ч`,
        detail: `${formatCount(first.views)} против ${formatCount(last.views)} у ${nameOf(last.row, rows)}${mixed ? '. Разные платформы: сравнивается охват, а не качество ролика.' : '.'}`
      });
    }
  }
  const started = rows.filter((row) => row.at6 !== null && row.at6 > 0).sort((a, b) => (b.at6 ?? 0) - (a.at6 ?? 0));
  if (mixed && started.length >= 2) {
    // Against each platform's usual curve: the fair verdict across platforms, when both curves exist.
    const [first, second] = [started[0]!, started[1]!];
    if (percent(first.at6 ?? 0, second.at6 ?? 1) >= 10) {
      result.push({
        title: `${nameOf(first, rows)} сильнее стартовал для своей платформы`,
        detail: `За первые 6 часов: ${ratio(first.at6 ?? 0, 1)}× к обычному против ${ratio(second.at6 ?? 0, 1)}× у ${nameOf(second, rows)}.`
      });
    }
  }
  let explained = false;
  for (const [pick, noun] of [
    [(item: ContentItemDto) => item.likes, 'лайков'],
    [(item: ContentItemDto) => item.comments, 'комментариев']
  ] as const) {
    const rates = rows
      .map((row) => ({ row, rate: per1000(pick(row.item), row.item.views) }))
      .filter((entry): entry is { row: Row; rate: number } => entry.rate !== null)
      .sort((a, b) => b.rate - a.rate);
    if (rates.length < 2) continue;
    const [first, last] = [rates[0]!, rates.at(-1)!];
    if (first.rate >= 1 && first.rate >= last.rate * 1.3) {
      // The rate explanation once, on the first rate fact.
      const why = explained ? '' : ' На 1000 просмотров, поэтому большой и маленький охват сравнимы.';
      explained = true;
      result.push({
        title: `${nameOf(first.row, rows)} сильнее цепляет: ${rateText(first.rate)} ${noun} на 1000 просмотров`,
        detail: `У ${nameOf(last.row, rows)} — ${rateText(last.rate)}.${why}`
      });
    }
  }
  const later = rows
    .filter((row) => row.at24 !== null && row.at48 !== null && (row.at24 ?? 0) > 0)
    .map((row) => ({ row, growth: percent(row.at48 ?? 0, row.at24 ?? 1) }))
    .sort((a, b) => b.growth - a.growth);
  if (later.length >= 2 && later[0]!.growth - later.at(-1)!.growth >= 10) {
    result.push({
      title: `${nameOf(later[0]!.row, rows)} лучше держит рост после суток`,
      detail: `С 24 до 48 часов прирост +${later[0]!.growth}%, у ${nameOf(later.at(-1)!.row, rows)} — +${later.at(-1)!.growth}%.`
    });
  }
  const likes = rows.filter((row) => row.item.likes !== null && row.usual.likes);
  if (result.length === 0 && likes.length > 0) {
    const below = likes.filter((row) => (row.item.likes ?? 0) < (row.usual.likes ?? 0));
    if (below.length === likes.length) {
      result.push({
        title: likes.length > 1 ? 'Все ниже медианы по лайкам' : `${nameOf(likes[0]!, rows)} ниже медианы по лайкам`,
        detail: 'Лайков меньше, чем обычно у ваших публикаций на этой платформе: проверьте призыв к реакции.'
      });
    } else if (below.length === 0) {
      result.push({
        title: likes.length > 1 ? 'Все выше медианы по лайкам' : `${nameOf(likes[0]!, rows)} выше медианы по лайкам`,
        detail: 'Аудитория реагирует активнее обычного.'
      });
    }
  }
  return result;
}

/** The one thing a card is best at against the others. */
function strengthOf(row: Row, rows: readonly Row[], mixed: boolean): string | null {
  const others = rows.filter((other) => other.item.id !== row.item.id);
  const best6 = Math.max(0, ...others.map((other) => other.at6 ?? 0));
  if (row.at6 !== null && best6 > 0 && row.at6 > best6) {
    return mixed
      ? `Сильнее всех стартовал относительно своей платформы: ${(Math.round(row.at6 * 10) / 10).toLocaleString('ru-RU')}× к обычному за 6 ч`
      : `+${percent(row.at6, best6)}% быстрее в первые 6 ч, чем остальные`;
  }
  if (row.at24 !== null && row.at48 !== null && row.at24 > 0) {
    return `+${percent(row.at48, row.at24)}% прироста с 24 до 48 ч`;
  }
  return null;
}

function Metric({ label, value, usual }: { label: string; value: number | null; usual: number | null }) {
  const change = value !== null && usual ? percent(value, usual) : null;
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        {formatCount(value)}
        {change !== null ? (
          <span data-tone={change >= 0 ? 'up' : 'down'}>
            {change > 0 ? '+' : change < 0 ? '−' : ''}
            {Math.abs(change)}%
          </span>
        ) : null}
      </dd>
    </div>
  );
}
