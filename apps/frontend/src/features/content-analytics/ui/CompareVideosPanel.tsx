import type { ContentBaselineDto, ContentItemDetailDto, ContentItemDto, ContentPlatform } from '@alexeev/contracts';
import { useQueries } from '@tanstack/react-query';
import { type CSSProperties, useMemo, useState } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import { Button, Dialog, IconButton, LineChart, Panel, SearchField, SegmentedControl } from '../../../shared/ui';
import { contentItemQueryOptions } from '../api/content-analytics-queries';
import { ageCurve, baselineCurve } from '../model/curves';
import { formatCount, formatPublished, PLATFORM_LABEL } from '../model/format';
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
  const [horizon, setHorizon] = useState<'24' | '72'>('24');
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
  const single = platforms.size === 1 ? chosen[0]?.platform : undefined;
  const baselineOf = (platform: ContentPlatform) => baselines.find((entry) => entry.platform === platform);

  const rows = chosen.map((item, index) => {
    const detail: ContentItemDetailDto | undefined = details[index]?.data;
    const curve = detail ? ageCurve(detail, hours) : [];
    const full = detail ? ageCurve(detail) : [];
    const at24 = viewsAt(full, 24);
    const usual24 = usualAt(baselineOf(item.platform), 24);
    return {
      item,
      color: COLORS[index] ?? COLORS[0]!,
      curve,
      at24,
      at72: viewsAt(full, 72),
      vsUsual: at24 !== null && usual24 ? Math.round((at24 / usual24) * 10) / 10 : null,
      loading: details[index]?.isPending ?? false
    };
  });

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
          <LineChart
            label={
              mode === 'views'
                ? 'Просмотры по часам после публикации'
                : 'Просмотры к обычному по часам после публикации'
            }
            series={[...series, ...reference]}
            formatX={(x) => `${Math.round(x)} ч`}
            formatY={mode === 'views' ? formatCount : (y) => `${(Math.round(y * 10) / 10).toLocaleString('ru-RU')}×`}
            xTicks={hours === 24 ? [0, 6, 12, 18, 24] : [0, 12, 24, 48, 72]}
            height={260}
          />
        )}

        {rows.length > 0 ? (
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Ролик</th>
                <th scope="col">24 ч</th>
                <th scope="col">72 ч</th>
                <th scope="col">Сейчас</th>
                <th scope="col">К обычному на 24 ч</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.item.id}>
                  <th scope="row" aria-label={row.item.title || 'Без текста'}>
                    <AriaButton className={styles.rowTitle} onPress={() => onOpen(row.item.id)}>
                      <span className={styles.swatch} style={{ '--swatch': row.color } as CSSProperties} />
                      <span>{row.item.title || 'Без текста'}</span>
                    </AriaButton>
                  </th>
                  <td>{formatCount(row.at24)}</td>
                  <td>{formatCount(row.at72)}</td>
                  <td>{formatCount(row.item.views)}</td>
                  <td
                    data-tone={
                      row.vsUsual === null ? 'flat' : row.vsUsual >= 1.5 ? 'up' : row.vsUsual <= 0.7 ? 'down' : 'flat'
                    }
                  >
                    {row.vsUsual === null ? '—' : `${row.vsUsual.toLocaleString('ru-RU')}×`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
