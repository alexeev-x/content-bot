import type { ContentBaselineDto, ContentItemDto, ContentPlatform } from '@alexeev/contracts';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import { Icon, LineChart, Panel, SegmentedControl, Skeleton } from '../../../shared/ui';
import { contentItemQueryOptions } from '../api/content-analytics-queries';
import { ageCurve, baselineCurve } from '../model/curves';
import { formatCount, formatPublished } from '../model/format';
import { rankOf, usualAt, verdictFor } from '../model/status';
import { ItemCover } from './ItemCover';
import { StatusChip } from './StatusChip';
import styles from './Widgets.module.css';

type Props = {
  items: readonly ContentItemDto[] | undefined;
  baselines: readonly ContentBaselineDto[];
  medians: Partial<Record<ContentPlatform, number | null>>;
  now: number;
  timezone: string;
  onOpen: (id: string) => void;
};

const KINDS = [
  { id: 'all', label: 'Все' },
  { id: 'video', label: 'Видео' },
  { id: 'post', label: 'Посты' }
] as const;
const LIMIT = 6;

/** «Свежие публикации»: the newest items with their status; a row opens its first 24 hours against the usual. */
export function FreshPanel({ items, baselines, medians, now, timezone, onOpen }: Props) {
  const [kind, setKind] = useState<'all' | 'video' | 'post'>('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const rows = [...(items ?? [])]
    .filter((item) => kind === 'all' || (kind === 'post' ? item.platform === 'telegram' : item.platform !== 'telegram'))
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
    .slice(0, LIMIT);

  return (
    <Panel
      title="Свежие публикации"
      headingLevel={2}
      quiet
      note="Статус — к обычному на том же возрасте"
      action={
        <SegmentedControl label="Тип" options={KINDS} value={kind} onChange={(id) => setKind(id as typeof kind)} />
      }
    >
      <div className={styles.body}>
        {items === undefined ? (
          <Skeleton lines={4} height={40} />
        ) : rows.length === 0 ? (
          <p className={styles.muted}>Публикаций нет.</p>
        ) : (
          <ul className={styles.rows}>
            {rows.map((item) => {
              const verdict = verdictFor(item, now, baselines, medians);
              const open = expanded === item.id;
              return (
                <li key={item.id}>
                  <AriaButton
                    className={styles.row}
                    aria-expanded={open}
                    onPress={() => setExpanded(open ? null : item.id)}
                  >
                    <ItemCover item={item} size="sm" />
                    <span className={styles.text}>
                      <span className={styles.title}>{item.title || 'Без текста'}</span>
                      <span className={styles.meta}>{formatPublished(item.publishedAt, timezone)}</span>
                    </span>
                    <span className={styles.side}>
                      <strong>{formatCount(item.views)}</strong>
                      <StatusChip verdict={verdict} />
                    </span>
                  </AriaButton>
                  {open ? (
                    <FirstDay
                      item={item}
                      items={items}
                      baseline={baselines.find((entry) => entry.platform === item.platform)}
                      onOpen={onOpen}
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Panel>
  );
}

function FirstDay({
  item,
  items,
  baseline,
  onOpen
}: {
  item: ContentItemDto;
  items: readonly ContentItemDto[];
  baseline: ContentBaselineDto | undefined;
  onOpen: (id: string) => void;
}) {
  const detail = useQuery(contentItemQueryOptions(item.id));
  const curve = detail.data ? ageCurve(detail.data, 24) : [];
  const usualCurve = baselineCurve(detail.data?.baseline ?? baseline, 24);
  const at24 = curve.at(-1);
  const usual = at24 ? usualAt(detail.data?.baseline ?? baseline, Math.max(1, at24.x)) : null;
  const change = at24 && usual ? Math.round(((at24.y - usual) / usual) * 100) : null;
  const rank = rankOf(item, items);
  return (
    <div className={styles.expand}>
      <div>
        {detail.isPending ? (
          <Skeleton height={180} />
        ) : curve.length < 2 ? (
          <p className={styles.muted}>Замеров первых суток нет: публикация вышла до начала отслеживания.</p>
        ) : (
          <LineChart
            label="Первые 24 часа: просмотры против обычной медианы"
            series={[
              { id: 'item', label: 'Текущие просмотры', points: curve, color: 'var(--color-accent)', area: true },
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
            formatX={(x) => `${Math.round(x)}ч`}
            formatY={formatCount}
            xTicks={[0, 4, 8, 12, 16, 20, 24]}
            height={180}
          />
        )}
      </div>
      <dl className={styles.stats}>
        <div>
          <dt>Просмотры за первые сутки</dt>
          <dd>{formatCount(at24?.y ?? null)}</dd>
        </div>
        <div>
          <dt>К обычной медиане</dt>
          <dd className={change === null ? undefined : change >= 0 ? styles.up : styles.down}>
            {change === null ? 'копим данные' : `${change > 0 ? '+' : ''}${change}%`}
          </dd>
        </div>
        <div>
          <dt>Обычная медиана</dt>
          <dd>{formatCount(usual)}</dd>
        </div>
        {rank ? (
          <div>
            <dt>Ранг по просмотрам</dt>
            <dd>
              {rank.position} из {rank.total}
            </dd>
          </div>
        ) : null}
        <AriaButton className={styles.link} onPress={() => onOpen(item.id)}>
          Подробнее <Icon name="arrow-right" size={14} />
        </AriaButton>
      </dl>
    </div>
  );
}
