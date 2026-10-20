import type { ContentItemDto, ContentPlatform } from '@alexeev/contracts';
import { type CSSProperties, useState } from 'react';
import { pluralRu } from '../../../shared/lib/ru-format';
import { Icon, Panel, SegmentedControl } from '../../../shared/ui';
import { formatCount, PLATFORM_LABEL } from '../model/format';
import { HOUR_BLOCKS, PLATFORMS, timeBlocks, type TimeBlock } from '../model/report';
import { PanelSkeleton } from './PanelSkeleton';
import styles from './PostingTimes.module.css';

type Props = {
  items: readonly ContentItemDto[] | undefined;
  platform: ContentPlatform | undefined;
  timezone: string;
};

/** A block needs this many publications before its median says anything. */
const MIN_ITEMS = 3;
/** «Лучше всего» needs at least this much above the usual. */
const BEST_FROM = 1.1;
/** Bars end at this multiple; anything above is drawn full. */
const SCALE_TOP = 2;

const TITLE = 'Когда публиковать';
/** «00–04» in the rows, so a window fits one line on a phone; the sentence above spells «00:00–04:00». */
const shortRange = (block: number) => {
  const start = HOUR_BLOCKS[block] ?? 0;
  return `${String(start).padStart(2, '0')}–${String(start + 4).padStart(2, '0')}`;
};
const range = (block: number) => {
  const start = HOUR_BLOCKS[block] ?? 0;
  return `${String(start).padStart(2, '0')}:00–${String(start + 4).padStart(2, '0')}:00`;
};

/**
 * «Когда публиковать» (owner, 20.10.2026: the weekday × hour grid was mostly «мало для оценки»): six windows of the
 * day, each the median views of what came out then against the usual, with how many publications it rests on.
 */
export function PostingTimesPanel({ items, platform, timezone }: Props) {
  const available = PLATFORMS.filter((each) => (items ?? []).some((item) => item.platform === each));
  const [chosen, setChosen] = useState<ContentPlatform | null>(null);
  const shown = platform ?? (chosen !== null && available.includes(chosen) ? chosen : available[0]);
  const note = `По времени выхода, к обычному · ${timezone}`;
  if (items === undefined) return <PanelSkeleton title={TITLE} note={note} rows={4.5} phoneRows={6} />;
  const blocks = shown
    ? timeBlocks(
        items.filter((item) => item.platform === shown),
        timezone
      )
    : [];
  const reliable = blocks.filter(
    (block): block is TimeBlock & { multiple: number } => block.items >= MIN_ITEMS && block.multiple !== null
  );
  const best = [...reliable].sort((a, b) => b.multiple - a.multiple)[0];
  const worst = [...reliable].sort((a, b) => a.multiple - b.multiple)[0];
  return (
    <Panel
      title={TITLE}
      headingLevel={2}
      quiet
      note={note}
      action={
        platform === undefined && available.length > 1 ? (
          <SegmentedControl
            label="Платформа"
            options={available.map((each) => ({ id: each, label: PLATFORM_LABEL[each] }))}
            value={shown ?? ''}
            onChange={(id) => setChosen(id as ContentPlatform)}
          />
        ) : undefined
      }
    >
      <div className={styles.body}>
        {shown === undefined ? (
          <p className={styles.muted}>За период публикаций нет.</p>
        ) : (
          <>
            <p className={styles.verdict}>
              <Icon name={best && best.multiple >= BEST_FROM ? 'sparkle' : 'info'} size={16} />
              {best && best.multiple >= BEST_FROM
                ? `Лучше всего заходит ${range(best.block)}: в ${best.multiple.toLocaleString('ru-RU')} раза выше обычного (${best.items} публ.)${worst && worst !== best && worst.multiple < 0.9 ? `. Слабее всего — ${range(worst.block)}` : ''}.`
                : `Явно лучшего времени пока нет: нужно хотя бы ${MIN_ITEMS} публикации в одном окне.`}
            </p>
            <ul className={styles.list} aria-label={`${PLATFORM_LABEL[shown]}: просмотры по времени выхода`}>
              {blocks.map((block) => {
                const enough = block.items >= MIN_ITEMS && block.multiple !== null;
                const multiple = block.multiple ?? 0;
                return (
                  <li
                    key={block.block}
                    className={styles.row}
                    data-tone={!enough ? 'few' : multiple >= 1.2 ? 'up' : multiple < 0.8 ? 'down' : 'usual'}
                    data-best={best && block === best && multiple >= BEST_FROM ? '' : undefined}
                  >
                    <span className={styles.time}>
                      <span className={styles.srOnly}>{range(block.block)}</span>
                      <span aria-hidden="true">{shortRange(block.block)}</span>
                    </span>
                    <span className={styles.track} aria-hidden="true">
                      <span
                        className={styles.bar}
                        style={{ '--share': enough ? Math.min(1, multiple / SCALE_TOP) : 0 } as CSSProperties}
                      />
                      <span className={styles.usual} />
                    </span>
                    <span className={styles.value}>{enough ? `${multiple.toLocaleString('ru-RU')}×` : '—'}</span>
                    <span className={styles.count}>
                      {block.items === 0
                        ? 'нет публикаций'
                        : enough
                          ? `${block.items} ${pluralRu(block.items, 'публ.', 'публ.', 'публ.')} · ${formatCount(block.medianViews)}`
                          : `мало: ${block.items}`}
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className={styles.muted}>
              Штрих посередине — как обычно (1×). Все дни недели вместе: так в каждом окне больше публикаций.
            </p>
          </>
        )}
      </div>
    </Panel>
  );
}
