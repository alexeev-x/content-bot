import type { ContentItemDto, ContentReportDto } from '@alexeev/contracts';
import type { CSSProperties } from 'react';
import { Panel } from '../../../shared/ui';
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
  const max = Math.max(1, ...pairs.flatMap((pair) => [pair.day.views, pair.before.views]));
  const viewsNow = now.reduce((sum, day) => sum + day.views, 0);
  const viewsBefore = before.reduce((sum, day) => sum + day.views, 0);
  const itemsNow = current.length;
  const step = Math.max(1, Math.ceil(pairs.length / 7));
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
        <figure
          className={styles.pairs}
          aria-label={`Просмотры по дням: ${formatCount(viewsNow)} за ${days} дней против ${formatCount(viewsBefore)} за прошлые`}
        >
          {pairs.map((pair) => (
            <div
              key={pair.day.day}
              className={styles.pair}
              title={`${formatDay(pair.day.day)}: ${formatCount(pair.day.views)} (прошлый период ${formatCount(pair.before.views)})`}
            >
              <span className={styles.barNow} style={{ height: `${Math.max(1, (pair.day.views / max) * 100)}%` }} />
              <span
                className={styles.barBefore}
                style={{ height: `${Math.max(1, (pair.before.views / max) * 100)}%` }}
              />
            </div>
          ))}
        </figure>
        <div className={styles.axis} aria-hidden="true">
          {pairs
            .filter((_, index) => index % step === 0)
            .map((pair) => (
              <span key={pair.day.day}>{formatDay(pair.day.day)}</span>
            ))}
        </div>
      </div>
    </Panel>
  );
}
