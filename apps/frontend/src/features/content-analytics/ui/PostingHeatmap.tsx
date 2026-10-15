import type { ContentItemDto, ContentPlatform } from '@alexeev/contracts';
import { type CSSProperties, useState } from 'react';
import { Icon, Panel, SegmentedControl } from '../../../shared/ui';
import { formatCount, PLATFORM_LABEL } from '../model/format';
import { HEAT_BLOCKS, PLATFORMS, postingHeatmap } from '../model/report';
import styles from './Report.module.css';
import widgets from './Widgets.module.css';

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const WEEKDAYS_FULL = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'];
/** A cell needs this many publications before its number means something. */
const MIN_ITEMS = 2;

type Props = {
  items: readonly ContentItemDto[] | undefined;
  platform: ContentPlatform | undefined;
  timezone: string;
};

/**
 * «Когда публиковать»: weekday × 4-hour block, each cell the median views of what was published then
 * against the platform's usual, with how many publications it rests on. A real table, readable without colour.
 */
export function PostingHeatmap({ items, platform, timezone }: Props) {
  const available = PLATFORMS.filter((each) => (items ?? []).some((item) => item.platform === each));
  const [chosen, setChosen] = useState<ContentPlatform | null>(null);
  const shown = platform ?? (chosen !== null && available.includes(chosen) ? chosen : available[0]);
  const cells = shown
    ? postingHeatmap(
        (items ?? []).filter((item) => item.platform === shown),
        timezone
      )
    : [];
  const best = cells
    .filter((cell) => cell.items >= MIN_ITEMS && cell.multiple !== null && cell.multiple >= 1.1)
    .sort((a, b) => (b.multiple ?? 0) - (a.multiple ?? 0))[0];

  return (
    <Panel
      title="Когда публиковать"
      headingLevel={2}
      quiet
      note={`Медиана просмотров к обычной, ${timezone}`}
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
      <div className={styles.heatLayout}>
        {shown === undefined ? (
          <p className={widgets.muted}>За период публикаций нет.</p>
        ) : (
          <table className={styles.heatTable}>
            <caption className={widgets.srOnly}>
              {PLATFORM_LABEL[shown]}: когда публикации набирают больше обычного
            </caption>
            <thead>
              <tr>
                <th scope="col">
                  <span className={widgets.srOnly}>День</span>
                </th>
                {HEAT_BLOCKS.map((start) => (
                  <th key={start} scope="col">
                    {String(start).padStart(2, '0')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {WEEKDAYS.map((weekday, row) => (
                <tr key={weekday}>
                  <th scope="row">{weekday}</th>
                  {HEAT_BLOCKS.map((start, block) => {
                    const cell = cells.find((entry) => entry.weekday === row && entry.block === block);
                    const enough = (cell?.items ?? 0) >= MIN_ITEMS && cell?.multiple !== null;
                    const multiple = cell?.multiple ?? null;
                    const level =
                      multiple === null || !cell?.items
                        ? null
                        : multiple >= 1.8
                          ? 'top'
                          : multiple >= 1.2
                            ? 'high'
                            : multiple >= 0.8
                              ? 'usual'
                              : 'low';
                    return (
                      <td
                        key={start}
                        className={styles.heatCell}
                        data-empty={level === null ? '' : undefined}
                        data-level={level ?? undefined}
                        data-best={best && cell === best ? '' : undefined}
                      >
                        {enough && multiple !== null ? (
                          <>
                            <span className={styles.heatValue}>{multiple.toLocaleString('ru-RU')}×</span>
                            <span className={styles.heatCount}>{cell?.items}</span>
                            <span className={styles.heatTip}>
                              {WEEKDAYS_FULL[row]}, {String(start).padStart(2, '0')}:00–
                              {String(start + 4).padStart(2, '0')}:00
                              <br />
                              Медиана {formatCount(cell?.medianViews ?? null)}, {multiple.toLocaleString('ru-RU')}× к
                              обычной
                              <br />
                              {cell?.items} публ.
                            </span>
                          </>
                        ) : (
                          <span className={widgets.srOnly}>
                            {cell?.items ? `${cell.items} публ., мало для оценки` : 'Нет публикаций'}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <aside className={styles.heatAside}>
          <section className={styles.heatBest}>
            <h3 className={styles.rankedHeading}>Лучшее окно</h3>
            {best && best.multiple !== null ? (
              <>
                <p className={styles.heatBestTime}>
                  <Icon name="sparkle" size={16} />
                  {WEEKDAYS[best.weekday]} · {String(HEAT_BLOCKS[best.block]).padStart(2, '0')}:00–
                  {String((HEAT_BLOCKS[best.block] ?? 0) + 2).padStart(2, '0')}:00
                  <span className={styles.multipleBadge} data-tone="up">
                    {best.multiple.toLocaleString('ru-RU')}×
                  </span>
                </p>
                <p className={widgets.muted}>
                  В {WEEKDAYS_FULL[best.weekday]} в это время медиана {formatCount(best.medianViews)} — в{' '}
                  {best.multiple.toLocaleString('ru-RU')} раза выше обычного ({best.items} публ.).
                </p>
              </>
            ) : (
              <p className={widgets.muted}>
                Явно лучшего времени пока нет: нужно больше публикаций в одних и тех же слотах.
              </p>
            )}
          </section>
          <section>
            <h3 className={styles.rankedHeading}>Как читать</h3>
            <ul className={styles.heatLevels}>
              <li>
                <span className={styles.heatCell} data-level="low" /> Ниже обычного
              </li>
              <li>
                <span className={styles.heatCell} data-level="usual" /> Обычно
              </li>
              <li>
                <span className={styles.heatCell} data-level="high" /> Выше обычного
              </li>
              <li>
                <span className={styles.heatCell} data-level="top" /> Значительно выше
              </li>
            </ul>
            <ul className={styles.heatKey}>
              <li>
                <span className={styles.heatCell} data-strong="" style={{ '--heat': 0.9 } as CSSProperties}>
                  <span className={styles.heatValue}>2×</span>
                </span>
                Во сколько раз медиана в это время выше обычной
              </li>
              <li>
                <span className={styles.heatSample}>5</span>
                Сколько публикаций в ячейке
              </li>
              <li>
                <span className={styles.heatCell} data-empty="" />
                Нет публикаций или меньше {MIN_ITEMS}
              </li>
            </ul>
          </section>
        </aside>
      </div>
    </Panel>
  );
}
