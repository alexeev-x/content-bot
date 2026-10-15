import type { ContentItemDto, ContentPlatform } from '@alexeev/contracts';
import { useQueries, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import { relativeTimeRu } from '../../../shared/lib/ru-format';
import { useNow } from '../../../shared/lib/use-now';
import { AreaChart, Icon, type IconName, LineChart, SegmentedControl, Skeleton } from '../../../shared/ui';
import { contentItemQueryOptions, contentReportQueryOptions } from '../api/content-analytics-queries';
import { ageCurve, baselineCurve, formatAge } from '../model/curves';
import { engagementRate, formatCount, likesLabel, PLATFORM_LABEL } from '../model/format';
import { blockLabel } from '../model/insights';
import {
  bestBlock,
  crossPosted,
  median,
  mediansByPlatform,
  multipleOf,
  percentChange,
  periodStats,
  PLATFORMS,
  splitPeriods
} from '../model/report';
import { usualAt, verdictFor } from '../model/status';
import { ItemCover } from './ItemCover';
import { PlatformLogo } from './PlatformLogo';
import { StatusChip } from './StatusChip';
import styles from './DashboardWidgets.module.css';

const RANGES = [
  { id: '6', label: '6 ч' },
  { id: '24', label: '24 ч' },
  { id: '72', label: '72 ч' }
] as const;

function Change({ value, suffix }: { value: number | null; suffix?: string }) {
  if (value === null) return null;
  return (
    <span className={styles.change} data-tone={value > 0 ? 'up' : value < 0 ? 'down' : 'flat'}>
      {value > 0 ? '↑ +' : value < 0 ? '↓ −' : ''}
      {Math.abs(value)}%{suffix ? <span className={styles.muted}> {suffix}</span> : null}
    </span>
  );
}

/**
 * «Последний ролик · <платформа>»: the newest item of one platform with its status, its numbers against the
 * platform's median and its first hours against the usual curve.
 */
export function LatestVideoSummary({ platform, onOpen }: { platform: ContentPlatform; onOpen: (id: string) => void }) {
  const report = useQuery(contentReportQueryOptions(30));
  const now = useNow().getTime();
  const [range, setRange] = useState<'6' | '24' | '72'>('24');
  const current = report.data ? splitPeriods(report.data, platform).current : undefined;
  const latest = [...(current ?? [])].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))[0];
  const detail = useQuery({ ...contentItemQueryOptions(latest?.id ?? ''), enabled: latest !== undefined });
  if (report.isPending) return <Skeleton height={220} />;
  if (!latest) return <p className={styles.empty}>За 30 дней публикаций в {PLATFORM_LABEL[platform]} нет.</p>;
  const medians = mediansByPlatform(current ?? []);
  const verdict = verdictFor(latest, now, report.data?.baselines ?? [], medians);
  const peers = current ?? [];
  const usualOf = (pick: (item: ContentItemDto) => number | null) =>
    median(
      peers
        .filter((item) => item.id !== latest.id)
        .map(pick)
        .filter((value): value is number => value !== null)
    );
  // A video in its first 72 hours is compared with the usual at the same age; older totals with the median.
  const young = now - Date.parse(latest.publishedAt) < 72 * 3_600_000;
  const metrics: { label: string; value: number | null; usual: number | null; percent?: boolean }[] = [
    { label: 'Просмотры', value: latest.views, usual: young ? verdict.usual : usualOf((item) => item.views) },
    { label: likesLabel(platform), value: latest.likes, usual: young ? null : usualOf((item) => item.likes) },
    { label: 'Комментарии', value: latest.comments, usual: young ? null : usualOf((item) => item.comments) },
    { label: 'ER', value: engagementRate(latest), usual: usualOf((item) => engagementRate(item)), percent: true }
  ].filter((metric) => metric.value !== null);
  const hours = Number(range);
  const curve = detail.data ? ageCurve(detail.data, hours) : [];
  const usualCurve = baselineCurve(detail.data?.baseline, hours);

  return (
    <div className={styles.body}>
      <AriaButton className={styles.head} onPress={() => onOpen(latest.id)}>
        <ItemCover item={latest} />
        <span className={styles.headText}>
          <span className={styles.title}>{latest.title || 'Без текста'}</span>
          <span className={styles.muted}>{relativeTimeRu(latest.publishedAt, now)}</span>
          <StatusChip verdict={verdict} withMultiple />
        </span>
      </AriaButton>
      <dl className={styles.metrics}>
        {metrics.map((metric) => (
          <div key={metric.label}>
            <dt>{metric.label}</dt>
            <dd>{metric.percent ? `${(metric.value ?? 0).toLocaleString('ru-RU')}%` : formatCount(metric.value)}</dd>
            <Change value={metric.usual ? percentChange(metric.value, metric.usual) : null} suffix="чем обычно" />
          </div>
        ))}
      </dl>
      <div className={styles.chartHead}>
        <span className={styles.label}>Динамика просмотров</span>
        <SegmentedControl
          label="Период графика"
          options={RANGES}
          value={range}
          onChange={(id) => setRange(id as typeof range)}
        />
      </div>
      {curve.length < 2 ? (
        <p className={styles.empty}>Замеров первых часов нет: ролик вышел до начала отслеживания.</p>
      ) : (
        <LineChart
          label={`${PLATFORM_LABEL[platform]}: просмотры по часам после публикации`}
          series={[
            { id: 'item', label: 'Этот ролик', points: curve, color: 'var(--color-accent)', area: true },
            ...(usualCurve.length > 1
              ? [{ id: 'usual', label: 'Обычно', points: usualCurve, color: 'var(--color-chart-muted)', dashed: true }]
              : [])
          ]}
          formatX={(x) => formatAge(x)}
          formatY={formatCount}
          height={170}
        />
      )}
    </div>
  );
}

/**
 * «Последний ролик на площадках»: the newest video found on more than one platform (same title within
 * four days), each platform with its numbers, its curve and its place against the usual.
 */
export function CrossPlatformSummary({ onOpen }: { onOpen: (id: string) => void }) {
  const report = useQuery(contentReportQueryOptions(30));
  const now = useNow().getTime();
  const current = report.data ? splitPeriods(report.data, undefined).current : [];
  const group = crossPosted(current, 1)[0];
  const details = useQueries({ queries: (group ?? []).map((item) => contentItemQueryOptions(item.id)) });
  if (report.isPending) return <Skeleton height={220} />;
  if (!group) {
    return (
      <p className={styles.empty}>
        Здесь появится ролик, вышедший сразу на нескольких площадках: с одинаковым названием в пределах четырёх дней.
      </p>
    );
  }
  const cover = group.find((item) => item.thumbnailUrl !== null) ?? group[0]!;
  const rows = group.map((item, index) => {
    const detail = details[index]?.data;
    const points = detail ? ageCurve(detail, 24) : [];
    const at = points.at(-1);
    const usual = at ? usualAt(detail?.baseline, Math.max(1, at.x)) : null;
    return {
      item,
      points,
      vsUsual: at && usual ? Math.round(((at.y - usual) / usual) * 100) : null
    };
  });
  const fastest = [...rows]
    .filter((row) => row.vsUsual !== null)
    .sort((a, b) => (b.vsUsual ?? 0) - (a.vsUsual ?? 0))[0];
  return (
    <div className={styles.body}>
      <AriaButton className={styles.head} onPress={() => onOpen(cover.id)}>
        <ItemCover item={cover} />
        <span className={styles.headText}>
          <span className={styles.title}>{cover.title || 'Без текста'}</span>
          <span className={styles.muted}>{relativeTimeRu(cover.publishedAt, now)}</span>
        </span>
      </AriaButton>
      <ul className={styles.platformRows}>
        {rows.map((row) => (
          <li key={row.item.id} className={styles.platformRow}>
            <AriaButton className={styles.platformName} onPress={() => onOpen(row.item.id)}>
              <PlatformLogo platform={row.item.platform} size={22} />
              {PLATFORM_LABEL[row.item.platform]}
            </AriaButton>
            <dl className={styles.inlineMetrics}>
              <div>
                <dt>Просмотры</dt>
                <dd>{formatCount(row.item.views)}</dd>
              </div>
              <div>
                <dt>{likesLabel(row.item.platform)}</dt>
                <dd>{formatCount(row.item.likes)}</dd>
              </div>
              <div>
                <dt>ER</dt>
                <dd>
                  {engagementRate(row.item) === null ? '—' : `${engagementRate(row.item)!.toLocaleString('ru-RU')}%`}
                </dd>
              </div>
            </dl>
            <span className={styles.platformChart}>
              {row.vsUsual !== null ? (
                <span className={styles.change} data-tone={row.vsUsual >= 0 ? 'up' : 'down'}>
                  {row.vsUsual > 0 ? '+' : ''}
                  {row.vsUsual}% к обычному
                </span>
              ) : null}
              <AreaChart
                points={row.points.map((point) => point.y)}
                x={row.points.map((point) => point.x)}
                height={36}
                tips={row.points.map((point) => `${formatAge(point.x)}: ${formatCount(point.y)}`)}
              />
            </span>
          </li>
        ))}
      </ul>
      {fastest && rows.length > 1 ? (
        <p className={styles.footer}>
          <Icon name="chart" size={16} />
          {PLATFORM_LABEL[fastest.item.platform]} стартовал лучше всех относительно своей площадки.
        </p>
      ) : null}
    </div>
  );
}

/** The analytics part of «Итоги за 7 дней»: four numbers against the previous week, best platform and slot. */
export function WeekStatsSummary({ timezone }: { timezone: string }) {
  const report = useQuery(contentReportQueryOptions(7));
  if (!report.data) return <Skeleton height={96} />;
  const { current, previous } = splitPeriods(report.data, undefined);
  const now = periodStats(current);
  const before = periodStats(previous);
  const medians = mediansByPlatform(current);
  const hits = current.filter((item) => (multipleOf(item, medians) ?? 0) >= 1.5).length;
  const best = PLATFORMS.map((platform) => {
    const own = current.filter((item) => item.platform === platform);
    return {
      platform,
      multiple: median(own.map((item) => multipleOf(item, medians) ?? 0)) ?? 0,
      views: periodStats(own).views
    };
  })
    .filter((entry) => entry.views > 0)
    .sort((a, b) => b.views - a.views)[0];
  const slot = bestBlock(current, timezone, 2);
  const stats: { icon: IconName; label: string; value: string; change: number | null; note?: string }[] = [
    {
      icon: 'file',
      label: 'Публикации',
      value: String(now.items),
      change: before.items > 0 ? percentChange(now.items, before.items) : null
    },
    {
      icon: 'eye',
      label: 'Медиана просмотров',
      value: formatCount(now.medianViews),
      change: percentChange(now.medianViews, before.medianViews)
    },
    { icon: 'sparkle', label: 'Выстрелили', value: `${hits}/${now.items}`, change: null, note: 'выше 1,5× медианы' },
    {
      icon: 'heart',
      label: 'Вовлечённость',
      value: now.engagement === null ? '—' : `${now.engagement.toLocaleString('ru-RU')}%`,
      change: percentChange(now.engagement, before.engagement)
    }
  ];
  return (
    <div className={styles.week}>
      <ul className={styles.weekStats}>
        {stats.map((stat) => (
          <li key={stat.label}>
            <span className={styles.label}>
              <Icon name={stat.icon} size={14} /> {stat.label}
            </span>
            <strong>{stat.value}</strong>
            {stat.change !== null ? (
              <Change value={stat.change} suffix="к прошлой неделе" />
            ) : (
              <span className={styles.muted}>{stat.note ?? 'не с чем сравнить'}</span>
            )}
          </li>
        ))}
      </ul>
      <div className={styles.weekBest}>
        <span>
          <Icon name="sparkle" size={16} /> Лучшая площадка недели:{' '}
          <strong>{best ? PLATFORM_LABEL[best.platform] : '—'}</strong>
        </span>
        <span>
          <Icon name="clock" size={16} /> Лучший слот: <strong>{slot ? blockLabel(slot.block) : 'мало данных'}</strong>
        </span>
      </div>
    </div>
  );
}
