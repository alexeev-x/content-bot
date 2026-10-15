import type { ContentBaselineDto, ContentItemDetailDto, ContentItemDto, ContentPlatform } from '@alexeev/contracts';
import { useQueries } from '@tanstack/react-query';
import { type CSSProperties, useMemo, useState } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import {
  AreaChart,
  Button,
  Dialog,
  IconButton,
  LineChart,
  Panel,
  SearchField,
  SegmentedControl
} from '../../../shared/ui';
import { contentItemQueryOptions } from '../api/content-analytics-queries';
import { ageCurve, baselineCurve } from '../model/curves';
import { formatCount, formatPublished, PLATFORM_LABEL } from '../model/format';
import { median } from '../model/report';
import { usualAt } from '../model/status';
import { ItemCover } from './ItemCover';
import { PlatformGlyph } from './PlatformGlyph';
import styles from './Compare.module.css';

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
export function CompareVideosPanel({ items, tracked, baselines, timezone, onOpen }: Props) {
  const trackedSet = useMemo(() => new Set(tracked), [tracked]);
  const sorted = useMemo(
    () => [...(items ?? [])].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)),
    [items]
  );
  const [picked, setPicked] = useState<string[] | null>(null);
  const [mode, setMode] = useState<'views' | 'index'>('views');
  const [horizon, setHorizon] = useState<'24' | '48' | '72'>('48');
  const [choosing, setChoosing] = useState(false);
  // By default the two newest items that have early readings: a comparison that can actually be drawn.
  const ids =
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
      usual: {
        views: medianOf((entry) => entry.views),
        likes: medianOf((entry) => entry.likes),
        comments: medianOf((entry) => entry.comments)
      },
      vsUsual: at24 !== null && usual24 ? Math.round((at24 / usual24) * 10) / 10 : null,
      loading: details[index]?.isPending ?? false
    };
  });

  const differences = keyDifferences(rows, mixed);

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
            label: row.item.title || 'Без текста',
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
                {row.item.title || 'Без текста'}
              </span>
              <IconButton
                icon="x"
                size="sm"
                label={`Убрать «${row.item.title || 'Без текста'}» из сравнения`}
                onPress={() => setPicked(ids.filter((id) => id !== row.item.id))}
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
        ) : series.length === 0 ? (
          <p className={styles.muted}>
            {rows.some((row) => row.loading)
              ? 'Загружаем замеры…'
              : 'У выбранных роликов нет замеров первых часов: они вышли до начала отслеживания. Выберите отмеченные «с первых часов».'}
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
          <div className={styles.cards}>
            {rows.map((row) => {
              const strength = strengthOf(row, rows, mixed);
              return (
                <article key={row.item.id} className={styles.card} style={{ '--swatch': row.color } as CSSProperties}>
                  <AriaButton className={styles.cardHead} onPress={() => onOpen(row.item.id)}>
                    <ItemCover item={row.item} size="sm" />
                    <span className={styles.cardTitle}>
                      <span>
                        <span className={styles.swatch} /> {row.item.title || 'Без текста'}
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
          </div>
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
          setPicked([...ids, id]);
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
                    <span className={styles.choiceTitle}>{item.title || 'Без текста'}</span>
                    <span className={styles.choiceMeta}>
                      <PlatformGlyph platform={item.platform} withLabel size={14} />
                      {formatPublished(item.publishedAt, timezone)}, {formatCount(item.views)} просм.
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
  usual: { views: number | null; likes: number | null; comments: number | null };
};

function percent(a: number, b: number): number {
  return Math.round(((a - b) / b) * 100);
}

function shortTitle(item: ContentItemDto): string {
  const title = item.title || 'Без текста';
  return title.length > 28 ? `«${title.slice(0, 27)}…»` : `«${title}»`;
}

/** What actually separates the compared items, in plain words; only the facts the readings support. */
function keyDifferences(rows: readonly Row[], mixed: boolean): { title: string; detail: string }[] {
  const result: { title: string; detail: string }[] = [];
  const started = rows.filter((row) => row.at6 !== null && row.at6 > 0).sort((a, b) => (b.at6 ?? 0) - (a.at6 ?? 0));
  if (started.length >= 2) {
    const [first, second] = [started[0]!, started[1]!];
    const gap = percent(first.at6 ?? 0, second.at6 ?? 1);
    if (gap >= 10) {
      result.push({
        title: `${shortTitle(first.item)} быстрее стартовал`,
        detail: mixed
          ? `За первые 6 часов: ${(Math.round((first.at6 ?? 0) * 10) / 10).toLocaleString('ru-RU')}× к обычному своей платформы против ${(Math.round((second.at6 ?? 0) * 10) / 10).toLocaleString('ru-RU')}× у ${shortTitle(second.item)}.`
          : `За первые 6 часов набрал на ${gap}% больше, чем ${shortTitle(second.item)}.`
      });
    }
  }
  const later = rows
    .filter((row) => row.at24 !== null && row.at48 !== null && (row.at24 ?? 0) > 0)
    .map((row) => ({ row, growth: percent(row.at48 ?? 0, row.at24 ?? 1) }))
    .sort((a, b) => b.growth - a.growth);
  if (later.length >= 2 && later[0]!.growth - later.at(-1)!.growth >= 10) {
    result.push({
      title: `${shortTitle(later[0]!.row.item)} лучше держит рост после суток`,
      detail: `С 24 до 48 часов прирост +${later[0]!.growth}%, у ${shortTitle(later.at(-1)!.row.item)} — +${later.at(-1)!.growth}%.`
    });
  }
  const likes = rows.filter((row) => row.item.likes !== null && row.usual.likes);
  if (likes.length > 0) {
    const below = likes.filter((row) => (row.item.likes ?? 0) < (row.usual.likes ?? 0));
    if (below.length === likes.length) {
      result.push({
        title: likes.length > 1 ? 'Все ниже медианы по лайкам' : `${shortTitle(likes[0]!.item)} ниже медианы по лайкам`,
        detail: 'Лайков меньше, чем обычно у ваших публикаций на этой платформе: проверьте призыв к реакции.'
      });
    } else if (below.length === 0) {
      result.push({
        title: likes.length > 1 ? 'Все выше медианы по лайкам' : `${shortTitle(likes[0]!.item)} выше медианы по лайкам`,
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
