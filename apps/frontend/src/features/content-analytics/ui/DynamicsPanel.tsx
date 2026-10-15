import type { ContentPlatform, ContentReportDto } from '@alexeev/contracts';
import { BarChart, Panel } from '../../../shared/ui';
import { formatCount, formatDay } from '../model/format';
import { percentChange } from '../model/report';
import styles from './Widgets.module.css';

type Props = {
  report: ContentReportDto | undefined;
  platform: ContentPlatform | undefined;
  days: number;
};

const DAY = 86_400_000;

function dayKeys(from: string, count: number): string[] {
  const start = Date.parse(`${from.slice(0, 10)}T00:00:00Z`);
  return Array.from({ length: count }, (_, index) => new Date(start + index * DAY).toISOString().slice(0, 10));
}

/**
 * «Прирост просмотров»: how many views all publications gained each day (from the daily readings, so an
 * old video that keeps growing counts every day it grows), against the same day of the previous period.
 */
export function DynamicsPanel({ report, platform, days }: Props) {
  if (!report) {
    return (
      <Panel title="Прирост просмотров" headingLevel={2} quiet>
        <div className={styles.body}>
          <div className={styles.pairs} aria-hidden="true" />
        </div>
      </Panel>
    );
  }
  const rows = report.growth.filter((row) => platform === undefined || row.platform === platform);
  const byDay = new Map<string, number>();
  for (const row of rows) byDay.set(row.day, (byDay.get(row.day) ?? 0) + row.views);
  const allNow = dayKeys(report.from, days + 1).map((day) => ({ day, views: byDay.get(day) }));
  const allBefore = dayKeys(report.previousFrom, days + 1).map((day) => ({ day, views: byDay.get(day) }));
  // While the history is shorter than the period, the chart starts at the first measured day instead of
  // drawing weeks of empty bars; the previous period keeps the same day offsets.
  const start = Math.max(
    0,
    allNow.findIndex((entry) => entry.views !== undefined)
  );
  const now = allNow.slice(start);
  const before = allBefore.slice(start, start + now.length);
  const measured = now.filter((entry) => entry.views !== undefined);
  const total = measured.reduce((sum, entry) => sum + (entry.views ?? 0), 0);
  const totalBefore = before.reduce((sum, entry) => sum + (entry.views ?? 0), 0);
  const hasBefore = before.some((entry) => entry.views !== undefined);
  const first = measured[0];

  return (
    <Panel
      title="Прирост просмотров"
      headingLevel={2}
      quiet
      note="Сколько просмотров набрали за день публикации младше 30 дней"
    >
      <div className={styles.body}>
        {measured.length < 2 ? (
          <p className={styles.muted}>
            Прирост считается по ежедневным замерам{first ? ` с ${formatDay(first.day)}` : ''}: график появится со
            второго дня. Пока смотрите «Каждая публикация» ниже.
          </p>
        ) : (
          <>
            <div className={styles.head}>
              <div className={styles.figures}>
                <div className={styles.figure}>
                  <span className={styles.small}>За {measured.length} дн. с замерами</span>
                  <strong>+{formatCount(total)}</strong>
                  {hasBefore ? (
                    <span className={total >= totalBefore ? styles.up : styles.down}>
                      {percentChange(total, totalBefore) ?? 0}% к прошлым {days} дн.
                    </span>
                  ) : (
                    <span className={styles.small}>прошлый период ещё не измерялся</span>
                  )}
                </div>
                <div className={styles.figure}>
                  <span className={styles.small}>В среднем за день</span>
                  <strong>+{formatCount(Math.round(total / measured.length))}</strong>
                </div>
              </div>
            </div>
            <BarChart
              label={`Прирост просмотров по дням: +${formatCount(total)} за ${measured.length} дней`}
              bars={now.map((entry, index) => ({
                id: entry.day,
                value: entry.views ?? 0,
                ...(hasBefore ? { compare: before[index]?.views ?? 0 } : {}),
                strong: true,
                title: formatDay(entry.day),
                lines: [
                  entry.views === undefined ? 'Замеров нет' : `+${formatCount(entry.views)} просмотров`,
                  ...(hasBefore ? [`Прошлый период: +${formatCount(before[index]?.views ?? 0)}`] : [])
                ]
              }))}
              startLabel={formatDay(now[0]!.day)}
              endLabel={formatDay(now.at(-1)!.day)}
              height={170}
            />
          </>
        )}
      </div>
    </Panel>
  );
}
