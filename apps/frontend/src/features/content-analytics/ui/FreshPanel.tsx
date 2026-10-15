import type { ContentBaselineDto, ContentItemDto, ContentPlatform } from '@alexeev/contracts';
import { useState } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import { Panel, SegmentedControl, Skeleton } from '../../../shared/ui';
import { formatCount, formatPublished } from '../model/format';
import { verdictFor } from '../model/status';
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

/** «Свежие публикации»: the newest items with their status; a row opens the item panel (its first day is there). */
export function FreshPanel({ items, baselines, medians, now, timezone, onOpen }: Props) {
  const [kind, setKind] = useState<'all' | 'video' | 'post'>('all');
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
              return (
                <li key={item.id}>
                  <AriaButton className={styles.row} onPress={() => onOpen(item.id)}>
                    <ItemCover item={item} size="sm" />
                    <span className={styles.text}>
                      <span className={styles.title} title={item.title || undefined}>
                        {item.title || 'Без текста'}
                      </span>
                      <span className={styles.meta}>{formatPublished(item.publishedAt, timezone)}</span>
                    </span>
                    <span className={styles.side}>
                      <strong>{formatCount(item.views)}</strong>
                      <StatusChip verdict={verdict} />
                    </span>
                  </AriaButton>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Panel>
  );
}
