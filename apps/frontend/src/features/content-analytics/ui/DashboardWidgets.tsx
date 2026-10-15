import type { ContentItemDto, ContentPlatform } from '@alexeev/contracts';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import { relativeTimeRu } from '../../../shared/lib/ru-format';
import { useNow } from '../../../shared/lib/use-now';
import { LineChart, SegmentedControl, Skeleton } from '../../../shared/ui';
import { contentItemQueryOptions, contentReportQueryOptions } from '../api/content-analytics-queries';
import { ageCurve, baselineCurve, formatAge } from '../model/curves';
import { engagementRate, formatCount, likesLabel, PLATFORM_LABEL } from '../model/format';
import { median, mediansByPlatform, percentChange, splitPeriods } from '../model/report';
import { verdictFor } from '../model/status';
import { ItemCover } from './ItemCover';
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
