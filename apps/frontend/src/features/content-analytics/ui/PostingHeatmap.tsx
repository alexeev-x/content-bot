import type { ContentItemDto, ContentPlatform } from '@alexeev/contracts';
import type { CSSProperties } from 'react';
import { Panel } from '../../../shared/ui';
import { formatCount, PLATFORM_LABEL } from '../model/format';
import { blockLabel } from '../model/insights';
import { HOUR_BLOCKS, PLATFORMS, postingHeatmap } from '../model/report';
import { copy } from './copy';
import styles from './Report.module.css';

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

type Props = {
  items: readonly ContentItemDto[] | undefined;
  platform: ContentPlatform | undefined;
  timezone: string;
};

/**
 * «Когда публиковать»: weekday × 4-hour block, each cell the median views of what was published then
 * against the platform's usual (TikTok and TGStat style). A real table, so it reads without colour.
 */
export function PostingHeatmap({ items, platform, timezone }: Props) {
  const platforms = PLATFORMS.filter(
    (each) => (platform === undefined || platform === each) && (items ?? []).some((item) => item.platform === each)
  );
  return (
    <Panel title={copy.heatmap.title} headingLevel={2} quiet note={copy.heatmap.note(timezone)}>
      <div className={styles.heatmaps}>
        {items === undefined ? (
          <div className={styles.chartSkeleton} aria-hidden="true" />
        ) : platforms.length === 0 ? (
          <p className={styles.empty}>{copy.performance.empty}</p>
        ) : (
          platforms.map((each) => {
            const cells = postingHeatmap(
              items.filter((item) => item.platform === each),
              timezone
            );
            return (
              <section key={each} className={styles.heatmap}>
                <table className={styles.heatTable}>
                  <caption className={styles.multipleTitle}>{PLATFORM_LABEL[each]}</caption>
                  <thead>
                    <tr>
                      <th scope="col">
                        <span className={styles.srOnly}>{copy.heatmap.weekday}</span>
                      </th>
                      {HOUR_BLOCKS.map((start, block) => (
                        <th key={start} scope="col" aria-label={blockLabel(block)}>
                          {String(start).padStart(2, '0')}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {WEEKDAYS.map((weekday, row) => (
                      <tr key={weekday}>
                        <th scope="row">{weekday}</th>
                        {HOUR_BLOCKS.map((start, block) => {
                          const cell = cells.find((entry) => entry.weekday === row && entry.block === block);
                          const multiple = cell?.multiple ?? null;
                          // Opacity of the accent: 1× usual is a light wash, 2× and more is full.
                          const strength = multiple === null ? 0 : Math.min(1, Math.max(0.08, multiple / 2));
                          return (
                            <td
                              key={start}
                              className={styles.heatCell}
                              data-empty={cell?.items ? undefined : ''}
                              data-strong={multiple !== null && multiple >= 1.3 ? '' : undefined}
                              style={{ '--heat': strength } as CSSProperties}
                              title={
                                cell?.items
                                  ? copy.heatmap.cell(cell.items, formatCount(cell.medianViews), multiple)
                                  : undefined
                              }
                            >
                              {cell?.items ? (
                                <>
                                  <span aria-hidden="true">
                                    {multiple === null ? '—' : `${multiple.toLocaleString('ru-RU')}×`}
                                  </span>
                                  <span className={styles.srOnly}>
                                    {copy.heatmap.cell(cell.items, formatCount(cell.medianViews), multiple)}
                                  </span>
                                </>
                              ) : (
                                <span className={styles.srOnly}>{copy.heatmap.none}</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            );
          })
        )}
      </div>
    </Panel>
  );
}
