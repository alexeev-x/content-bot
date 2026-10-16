import type { ContentBaselineDto, ContentItemDetailDto, ContentItemDto, ContentPlatform } from '@alexeev/contracts';
import { useQuery } from '@tanstack/react-query';
import { type CSSProperties, useState } from 'react';
import { pluralRu, relativeTimeRu } from '../../../shared/lib/ru-format';
import {
  Button,
  Drawer,
  ErrorState,
  Icon,
  type IconName,
  LineChart,
  SegmentedControl,
  Skeleton,
  Tab,
  TabList,
  TabPanel,
  Tabs
} from '../../../shared/ui';
import { contentItemQueryOptions } from '../api/content-analytics-queries';
import { ageCurve, baselineBand, baselineCurve, formatAge, rangeForAge } from '../model/curves';
import {
  engagementRate,
  formatCount,
  formatExact,
  formatPublished,
  formatViews,
  itemTitle,
  likesLabel,
  PLATFORM_LABEL
} from '../model/format';
import { crossPosted, isSettled, median, multipleOf, settledItems } from '../model/report';
import { rankOf, verdictFor, YOUNG_HOURS } from '../model/status';
import { RefreshAnalyticsButton } from './RefreshAnalyticsButton';
import { copy } from './copy';
import styles from './Drawer.module.css';
import { ItemCover } from './ItemCover';
import { PlatformGlyph } from './PlatformGlyph';
import { StatusChip } from './StatusChip';

/** What the page knows about the period, so the panel can place the item among its peers. */
export type DrawerContext = {
  items: readonly ContentItemDto[];
  medians: Partial<Record<ContentPlatform, number | null>>;
  baselines: readonly ContentBaselineDto[];
  days: number;
};

type Props = {
  id: string | undefined;
  onClose: () => void;
  onOpen: (id: string) => void;
  timezone: string;
  now: number;
  context?: DrawerContext | undefined;
  /** «Сравнить по часам»: opens «Сравнение роликов» with these items. */
  onCompare?: ((ids: string[]) => void) | undefined;
};

const RANGES = [
  { id: '24', label: '24 ч' },
  { id: '72', label: '72 ч' },
  { id: 'all', label: 'Всё время' }
] as const;

/** `other` against `item` in words: «в 3,8 раза больше» / «в 2 раза меньше» / «примерно столько же». */
function versus(other: ContentItemDto, item: ContentItemDto): string {
  if (other.views === null || item.views === null || other.views === 0 || item.views === 0) return '—';
  const ratio = other.views / item.views;
  const fold = (value: number) => (Math.round(value * 10) / 10).toLocaleString('ru-RU');
  if (ratio >= 1.15) return `в ${fold(ratio)} раза больше`;
  if (ratio <= 1 / 1.15) return `в ${fold(1 / ratio)} раза меньше`;
  return 'примерно столько же';
}

function times(multiple: number): string {
  if (multiple >= 1.15) return `В ${multiple.toLocaleString('ru-RU')} раза больше медианы`;
  if (multiple <= 0.85) return `${Math.round(multiple * 100)}% от медианы`;
  return 'Примерно как обычно';
}

/** One post or video: its place in the period, its numbers against the usual and its growth. */
export function ItemDrawer({ id, onClose, onOpen, timezone, now, context, onCompare }: Props) {
  const query = useQuery({ ...contentItemQueryOptions(id ?? ''), enabled: id !== undefined });
  const detail = query.data;
  return (
    <Drawer
      isOpen={id !== undefined}
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={detail ? itemTitle(detail.item) : copy.title}
      size="wide"
    >
      {query.isError ? (
        <ErrorState message={copy.detail.error} onRetry={() => void query.refetch()} />
      ) : detail === undefined ? (
        <div className={styles.body} aria-busy="true">
          <Skeleton height={140} radius="var(--radius-2)" />
          <Skeleton lines={4} />
        </div>
      ) : (
        <DrawerBody
          detail={detail}
          timezone={timezone}
          now={now}
          context={context}
          onOpen={onOpen}
          onCompare={onCompare}
        />
      )}
    </Drawer>
  );
}

function DrawerBody({
  detail,
  timezone,
  now,
  context,
  onOpen,
  onCompare
}: {
  detail: ContentItemDetailDto;
  timezone: string;
  now: number;
  context: DrawerContext | undefined;
  onOpen: (id: string) => void;
  onCompare: ((ids: string[]) => void) | undefined;
}) {
  const { item } = detail;
  // Opens on the range that fits the item's age: a 3-hour-old video is not shown on a 72-hour scale.
  const [range, setRange] = useState<'24' | '72' | 'all'>(() =>
    rangeForAge((now - Date.parse(item.publishedAt)) / 3_600_000)
  );
  const peers = (context?.items ?? []).filter((entry) => entry.platform === item.platform);
  const medians = context?.medians ?? {};
  const verdict = verdictFor(item, now, [detail.baseline], medians);
  const inPeriod = peers.some((entry) => entry.id === item.id);
  // A young item has not collected its views yet: no place, «×» or counts against settled ones.
  const settled = isSettled(item, now);
  const settledPeers = settledItems(peers, now);
  const rank = inPeriod && settled ? rankOf(item, settledPeers) : null;
  const viewsMultiple = multipleOf(item, medians, now);
  const medianOf = (pick: (entry: ContentItemDto) => number | null) =>
    median(settledPeers.map(pick).filter((value): value is number => value !== null));
  const countUsual = (pick: (entry: ContentItemDto) => number | null) => (settled ? medianOf(pick) : null);
  const rate = engagementRate(item);
  const usualRate = medianOf((entry) => engagementRate(entry));

  type Metric = {
    label: string;
    icon: IconName;
    color: string;
    value: number | null;
    usual: number | null;
    percent?: boolean;
  };
  const allMetrics: Metric[] = [
    {
      label: copy.table.views,
      icon: 'eye',
      color: 'var(--color-accent)',
      value: item.views,
      usual: countUsual((entry) => entry.views)
    },
    {
      label: likesLabel(item.platform),
      icon: 'heart',
      color: 'var(--color-status-failed-fg)',
      value: item.likes,
      usual: countUsual((entry) => entry.likes)
    },
    {
      label: copy.table.comments,
      icon: 'message',
      color: 'var(--color-series-2)',
      value: item.comments,
      usual: countUsual((entry) => entry.comments)
    },
    {
      label: 'Репосты',
      icon: 'send',
      color: 'var(--color-series-3)',
      value: item.shares,
      usual: countUsual((entry) => entry.shares)
    },
    {
      label: copy.table.er,
      icon: 'sparkle',
      color: 'var(--color-series-4)',
      value: rate,
      usual: usualRate,
      percent: true
    }
  ];
  const metrics = allMetrics.filter((metric) => metric.value !== null);

  const maxHours = range === 'all' ? undefined : Number(range);
  const curve = ageCurve(detail, maxHours);
  const usualCurve = baselineCurve(detail.baseline, maxHours ?? 72);
  const usualBand = baselineBand(detail.baseline, maxHours ?? 72);
  const ageHours = (now - Date.parse(item.publishedAt)) / 3_600_000;
  const last = detail.snapshots.filter((snapshot) => snapshot.views !== null).slice(-2);
  const speed =
    last.length === 2
      ? Math.round(
          ((last[1]!.views ?? 0) - (last[0]!.views ?? 0)) /
            Math.max(1, (Date.parse(last[1]!.observedAt) - Date.parse(last[0]!.observedAt)) / 3_600_000)
        )
      : null;
  const similar = peers
    .filter((entry) => entry.id !== item.id)
    .sort(
      (a, b) =>
        Math.abs(Date.parse(a.publishedAt) - Date.parse(item.publishedAt)) -
        Math.abs(Date.parse(b.publishedAt) - Date.parse(item.publishedAt))
    )
    .slice(0, 4);
  // The same video on the other platforms (matched as in «Один ролик на платформах»).
  const twins = (
    crossPosted(context?.items ?? [], Number.POSITIVE_INFINITY).find((group) =>
      group.some((entry) => entry.id === item.id)
    ) ?? []
  ).filter((entry) => entry.id !== item.id);
  // A young item gets its «×» once settled: say when, instead of «nothing to compare with».
  const daysToSettle = Math.max(1, Math.ceil((YOUNG_HOURS - ageHours) / 24));
  const compareIds = [item.id, ...(twins.length > 0 ? twins : similar.slice(0, 1)).map((entry) => entry.id)].slice(
    0,
    4
  );

  return (
    <div className={styles.body}>
      <div className={styles.head}>
        <ItemCover item={item} />
        <div className={styles.headText}>
          <p className={styles.meta}>
            <PlatformGlyph platform={item.platform} withLabel />
            <span>{formatPublished(item.publishedAt, timezone)}</span>
          </p>
          <a className={styles.external} href={item.url} target="_blank" rel="noreferrer noopener">
            {copy.detail.open(PLATFORM_LABEL[item.platform])}
            <Icon name="external" size={14} />
          </a>
        </div>
      </div>

      <Tabs>
        <TabList aria-label="Разделы публикации">
          <Tab id="overview">Обзор</Tab>
          <Tab id="growth">Динамика</Tab>
          <Tab id="compare">Сравнение</Tab>
        </TabList>

        <TabPanel id="overview">
          <div className={styles.section}>
            <div className={styles.hero} data-status={verdict.status}>
              <div className={styles.heroTop}>
                <StatusChip verdict={verdict} />
                {rank && rank.topPercent <= 50 ? (
                  <span className={styles.pill}>Топ {rank.topPercent}% контента</span>
                ) : null}
              </div>
              <p className={styles.heroTitle}>
                {rank
                  ? `${rank.position}-е место из ${rank.total} в ${PLATFORM_LABEL[item.platform]} за ${context?.days ?? 30} дней`
                  : inPeriod && !settled
                    ? 'Место среди публикаций появится через 3 дня после выхода'
                    : 'Вне выбранного периода'}
              </p>
              {viewsMultiple !== null ? (
                <p className={styles.heroText}>
                  {times(viewsMultiple)} ({formatCount(medians[item.platform] ?? null)})
                </p>
              ) : null}
              <p className={styles.heroNote}>
                {verdict.status === 'rising'
                  ? 'Ролик набирает заметно больше обычного. Повторите тему или первую фразу.'
                  : verdict.status === 'below'
                    ? 'Ролик идёт слабее обычного: проверьте первую строку и время выхода.'
                    : verdict.status === 'normal'
                      ? 'Ролик идёт в пределах обычного для платформы.'
                      : 'Статус появится, когда накопятся замеры на том же возрасте у других роликов.'}
              </p>
            </div>

            <ul className={styles.metrics}>
              {metrics.map((metric) => {
                const multiple =
                  metric.value !== null && metric.usual !== null && metric.usual > 0
                    ? Math.round((metric.value / metric.usual) * 10) / 10
                    : null;
                return (
                  <li key={metric.label} className={styles.metric}>
                    <span className={styles.metricIcon} style={{ '--metric': metric.color } as CSSProperties}>
                      <Icon name={metric.icon} size={16} />
                    </span>
                    <span className={styles.metricText}>
                      <span className={styles.metricLabel}>{metric.label}</span>
                      <strong>
                        {metric.percent ? `${(metric.value ?? 0).toLocaleString('ru-RU')}%` : formatExact(metric.value)}
                      </strong>
                      <span
                        className={styles.metricNote}
                        data-tone={
                          multiple === null ? 'flat' : multiple >= 1.15 ? 'up' : multiple <= 0.85 ? 'down' : 'flat'
                        }
                      >
                        {multiple !== null
                          ? times(multiple)
                          : inPeriod && !settled
                            ? `Сравним через ${daysToSettle} ${pluralRu(daysToSettle, 'день', 'дня', 'дней')}`
                            : 'Не с чем сравнить'}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>

            {/* The growth chart lives on «Динамика» only: the same chart on both tabs read as a repeat (owner, 16.10.2026). */}

            <section aria-labelledby="item-findings">
              <h3 id="item-findings" className={styles.sectionTitle}>
                Аналитика и выводы
              </h3>
              <div className={styles.findings}>
                <div className={styles.finding} data-tone="accent">
                  <p className={styles.findingTitle}>
                    <Icon name="zap" size={16} /> Скорость набора
                  </p>
                  <p>
                    {speed === null
                      ? 'Скорость появится после второго замера.'
                      : `Сейчас +${formatCount(Math.max(0, speed))} просмотров в час. Возраст публикации — ${formatAge(ageHours)}. Первые 72 часа замеры каждый час, потом раз в день.`}
                  </p>
                </div>
                <div className={styles.finding} data-tone={verdict.status === 'below' ? 'warn' : 'good'}>
                  <p className={styles.findingTitle}>
                    <Icon name="chart" size={16} /> Сравнение с обычным
                  </p>
                  <p>
                    {verdict.multiple === null
                      ? 'Пока не с чем сравнить на этом возрасте.'
                      : `${verdict.basis === 'age' ? `На ${formatAge(ageHours)}` : 'За всё время'} ролик набрал ${formatViews(item)} при обычных ${formatCount(verdict.usual)} — ${verdict.multiple.toLocaleString('ru-RU')}×.`}
                  </p>
                </div>
                <div className={styles.finding} data-tone="violet">
                  <p className={styles.findingTitle}>
                    <Icon name="heart" size={16} /> Вовлечённость
                  </p>
                  <p>
                    {rate === null || usualRate === null
                      ? 'Нет данных о реакциях.'
                      : `${rate.toLocaleString('ru-RU')}% против обычных ${(Math.round(usualRate * 10) / 10).toLocaleString('ru-RU')}%: ${rate >= usualRate ? 'аудитория реагирует активнее обычного' : 'реагируют меньше обычного'}.`}
                  </p>
                </div>
              </div>
            </section>
          </div>
        </TabPanel>

        <TabPanel id="growth">
          <div className={styles.section}>
            <GrowthChart curve={curve} usualCurve={usualCurve} usualBand={usualBand} range={range} onRange={setRange} />
            <table className={styles.snapshots}>
              <caption className={styles.sectionTitle}>Замеры</caption>
              <thead>
                <tr>
                  <th scope="col">Время</th>
                  <th scope="col">Возраст</th>
                  <th scope="col">Просмотры</th>
                  <th scope="col">{likesLabel(item.platform)}</th>
                </tr>
              </thead>
              <tbody>
                {[...detail.snapshots]
                  .reverse()
                  .slice(0, 24)
                  .map((snapshot) => (
                    <tr key={snapshot.observedAt}>
                      <td>{formatPublished(snapshot.observedAt, timezone)}</td>
                      <td>{formatAge((Date.parse(snapshot.observedAt) - Date.parse(item.publishedAt)) / 3_600_000)}</td>
                      <td>{formatExact(snapshot.views)}</td>
                      <td>{formatExact(snapshot.likes)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </TabPanel>

        <TabPanel id="compare">
          <div className={styles.section}>
            {twins.length > 0 ? (
              <section className={styles.compareBlock} aria-labelledby="item-twins">
                <h3 id="item-twins" className={styles.sectionTitle}>
                  Этот ролик на других платформах
                </h3>
                <ul className={styles.similar}>
                  {[item, ...twins].map((entry) => (
                    <li key={entry.id}>
                      <button
                        type="button"
                        className={styles.similarRow}
                        data-current={entry.id === item.id || undefined}
                        disabled={entry.id === item.id}
                        onClick={() => onOpen(entry.id)}
                      >
                        <PlatformGlyph platform={entry.platform} />
                        <span className={styles.similarText}>
                          <span className={styles.similarTitle}>
                            {PLATFORM_LABEL[entry.platform]}
                            {entry.id === item.id ? ' · этот' : ''}
                          </span>
                          <span className={styles.metricLabel}>
                            {formatViews(entry)} просм. · {likesLabel(entry.platform).toLowerCase()}:{' '}
                            {formatCount(entry.likes)}
                            {engagementRate(entry) !== null
                              ? ` · ER ${engagementRate(entry)?.toLocaleString('ru-RU')}%`
                              : ''}
                          </span>
                        </span>
                        <span className={styles.multiple}>{entry.id === item.id ? '' : versus(entry, item)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
                <p className={styles.muted}>Просмотры на разных платформах — это разный охват, а не качество ролика.</p>
              </section>
            ) : null}

            <section className={styles.compareBlock} aria-labelledby="item-neighbours">
              <h3 id="item-neighbours" className={styles.sectionTitle}>
                Соседние публикации в {PLATFORM_LABEL[item.platform]}
              </h3>
              {similar.length === 0 ? (
                <p className={styles.muted}>Других публикаций за период нет.</p>
              ) : (
                <>
                  <ul className={styles.similar}>
                    {[item, ...similar].map((entry) => {
                      const multiple = multipleOf(entry, medians, now);
                      const current = entry.id === item.id;
                      return (
                        <li key={entry.id}>
                          <button
                            type="button"
                            className={styles.similarRow}
                            data-current={current || undefined}
                            disabled={current}
                            onClick={() => onOpen(entry.id)}
                          >
                            <ItemCover item={entry} size="sm" />
                            <span className={styles.similarText}>
                              <span className={styles.similarTitle}>{current ? 'Этот ролик' : itemTitle(entry)}</span>
                              <span className={styles.metricLabel}>
                                {formatPublished(entry.publishedAt, timezone)}, {formatViews(entry)} просм.
                              </span>
                            </span>
                            <span className={styles.multiple}>
                              {multiple !== null
                                ? `${multiple.toLocaleString('ru-RU')}×`
                                : isSettled(entry, now)
                                  ? '—'
                                  : 'рано'}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  <p className={styles.muted}>
                    × — во сколько раз больше медианы {PLATFORM_LABEL[item.platform]} за период. Свежие ролики получают
                    его через 3 дня после выхода.
                  </p>
                </>
              )}
            </section>

            {onCompare && compareIds.length > 1 ? (
              <Button variant="secondary" icon="chart" onPress={() => onCompare(compareIds)}>
                Сравнить по часам
              </Button>
            ) : null}
          </div>
        </TabPanel>
      </Tabs>

      <div className={styles.footer}>
        <p className={styles.muted}>{copy.detail.observed(relativeTimeRu(item.observedAt, now))}</p>
        <RefreshAnalyticsButton />
      </div>
    </div>
  );
}

function GrowthChart({
  curve,
  usualCurve,
  usualBand,
  range,
  onRange
}: {
  curve: { x: number; y: number }[];
  usualCurve: { x: number; y: number }[];
  usualBand: { x: number; low: number; high: number }[];
  range: '24' | '72' | 'all';
  onRange: (range: '24' | '72' | 'all') => void;
}) {
  return (
    <section className={styles.chartCard} aria-labelledby="item-growth">
      <div className={styles.chartHead}>
        <h3 id="item-growth" className={styles.sectionTitle}>
          {copy.detail.growth}
        </h3>
        <SegmentedControl
          label="Период графика"
          options={RANGES}
          value={range}
          onChange={(value) => onRange(value as '24' | '72' | 'all')}
        />
      </div>
      {curve.length < 2 ? (
        <p className={styles.muted}>{copy.detail.growthEmpty}</p>
      ) : (
        <LineChart
          label="Просмотры по часам после публикации против обычной медианы"
          series={[
            { id: 'item', label: 'Этот ролик', points: curve, color: 'var(--color-accent)', area: true },
            ...(usualCurve.length > 1
              ? [
                  {
                    id: 'usual',
                    label: 'Обычная медиана',
                    points: usualCurve,
                    color: 'var(--color-chart-muted)',
                    dashed: true
                  }
                ]
              : [])
          ]}
          band={
            usualBand.length > 1
              ? { label: 'Обычно: средняя половина роликов', points: usualBand, color: 'var(--color-chart-muted)' }
              : undefined
          }
          formatX={(x) => formatAge(x)}
          formatY={formatCount}
          height={220}
        />
      )}
    </section>
  );
}
