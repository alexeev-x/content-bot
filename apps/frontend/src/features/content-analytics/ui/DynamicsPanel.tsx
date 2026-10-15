import type { ContentItemDto, ContentReportDto } from '@alexeev/contracts';
import type { CSSProperties } from 'react';
import { BarChart, Panel } from '../../../shared/ui';
import { formatCount, formatDay } from '../model/format';
import { percentChange, viewsByDay } from '../model/report';
import styles from './Widgets.module.css';

type Props = {
  report: ContentReportDto | undefined;
  current: readonly ContentItemDto[] | undefined;
  previous: readonly ContentItemDto[] | undefined;
  days: number;
  timezone: string;
};

function Delta({ value }: { value: number | null }) {
  if (value === null) return <span className={styles.small}>не с чем сравнить</span>;
  return (
    <span className={value >= 0 ? styles.up : styles.down}>
      {value > 0 ? '↑ +' : value < 0 ? '↓ −' : ''}
      {Math.abs(value)}%
    </span>
  );
}

/** Views of what was published each day, this period against the same day of the previous one. */
export function DynamicsPanel({ report, current, previous, days, timezone }: Props) {
  if (!report || !current || !previous) {
    return (
      <Panel title="Динамика просмотров" headingLevel={2} quiet>
        <div className={styles.body}>
          <div className={styles.pairs} aria-hidden="true" />
        </div>
      </Panel>
    );
  }
  const now = viewsByDay(current, report.from, report.to, timezone);
  const before = viewsByDay(previous, report.previousFrom, report.from, timezone);
  // Day i of this period faces day i of the previous one.
  const pairs = now.map((day, index) => ({ day, before: before[index] ?? { day: '', views: 0, items: 0 } }));
  const viewsNow = now.reduce((sum, day) => sum + day.views, 0);
  const viewsBefore = before.reduce((sum, day) => sum + day.views, 0);
  const itemsNow = current.length;
  return (
    <Panel title="Динамика просмотров" headingLevel={2} quiet note="По дню публикации">
      <div className={styles.body}>
        <div className={styles.head}>
          <div className={styles.figures}>
            <div className={styles.figure}>
              <span className={styles.small}>Просмотры</span>
              <strong>{formatCount(viewsNow)}</strong>
              <Delta value={previous.length > 0 ? percentChange(viewsNow, viewsBefore) : null} />
            </div>
            <div className={styles.figure}>
              <span className={styles.small}>Публикации</span>
              <strong>{itemsNow}</strong>
              <Delta value={previous.length > 0 ? percentChange(itemsNow, previous.length) : null} />
            </div>
          </div>
          <ul className={styles.legend}>
            <li>
              <span className={styles.swatch} style={{ '--swatch': 'var(--color-accent)' } as CSSProperties} />
              Текущий период
            </li>
            <li>
              <span className={styles.swatch} style={{ '--swatch': 'var(--color-chart-muted)' } as CSSProperties} />
              Прошлые {days} дн.
            </li>
          </ul>
        </div>
        <BarChart
          label={`Просмотры по дням: ${formatCount(viewsNow)} за ${days} дней против ${formatCount(viewsBefore)} за прошлые`}
          bars={pairs.map((pair) => ({
            id: pair.day.day,
            value: pair.day.views,
            compare: pair.before.views,
            strong: true,
            title: formatDay(pair.day.day),
            lines: [
              `${formatCount(pair.day.views)} просм., ${pair.day.items} публ.`,
              `Прошлый период${pair.before.day ? ` (${formatDay(pair.before.day)})` : ''}: ${formatCount(pair.before.views)}`
            ]
          }))}
          startLabel={pairs[0] ? formatDay(pairs[0].day.day) : undefined}
          endLabel={pairs.at(-1) ? formatDay(pairs.at(-1)!.day.day) : undefined}
          height={170}
        />
      </div>
    </Panel>
  );
}
