import { RUBRIC_TITLES, type RubricCompare, type RubricLearning } from '@alexeev/contracts';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError } from '../../../shared/api/http-client';
import { ErrorState, Panel, SegmentedControl, Skeleton, Switch, useToast } from '../../../shared/ui';
import { rubricCompareQueryOptions, rubricLearningQueryOptions, useUpdateRubricLearning } from '../api/rubrics-queries';
import { mskWhen } from '../model/msk';
import { analyticsCopy as copy, times } from './analytics-copy';
import styles from './RubricsAnalytics.module.css';

const HOURS = Array.from({ length: 16 }, (_, index) => index + 8);
const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const clock = (minute: number) => `${Math.floor(minute / 60)}:${String(minute % 60).padStart(2, '0')}`;

/** A cell's tone: ×1 is neutral; stronger or weaker by steps, never by colour alone (the number is in the cell). */
function tone(x: number | null): string {
  if (x === null) return 'none';
  if (x >= 1.3) return 'high';
  if (x >= 1.1) return 'up';
  if (x <= 0.75) return 'low';
  if (x <= 0.9) return 'down';
  return 'even';
}

/** Weekday × Moscow hour: the median score of the rubric posts sent there; empty below three posts. */
export function HeatGrid({ cells }: { cells: RubricCompare['hours']['cells'] }) {
  const at = new Map(cells.map((cell) => [`${cell.weekday}:${cell.hour}`, cell]));
  return (
    <div className={styles.heatScroll}>
      <table className={styles.heat}>
        <caption className={styles.muted}>{copy.heatCaption}</caption>
        <thead>
          <tr>
            <th scope="col">
              <span className={styles.visuallyHidden}>{copy.heatDay}</span>
            </th>
            {HOURS.map((hour) => (
              <th key={hour} scope="col">
                {hour}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {WEEKDAYS.map((name, weekday) => (
            <tr key={name}>
              <th scope="row">{name}</th>
              {HOURS.map((hour) => {
                const cell = at.get(`${weekday}:${hour}`);
                return (
                  <td
                    key={hour}
                    data-tone={tone(cell?.x ?? null)}
                    title={cell === undefined ? undefined : copy.heatCell(cell.n, times(cell.x), cell.trial)}
                  >
                    {cell === undefined ? '' : cell.x === null ? cell.n : times(cell.x).slice(1)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function RubricsHours() {
  const [days, setDays] = useState<30 | 90>(90);
  const query = useQuery(rubricCompareQueryOptions(days));
  return (
    <Panel
      title={copy.heatTitle}
      note={copy.heatNote}
      action={
        <SegmentedControl
          label={copy.periodLabel}
          options={([30, 90] as const).map((value) => ({ id: String(value), label: copy.periods[value] }))}
          value={String(days)}
          onChange={(id) => setDays(Number(id) as 30 | 90)}
        />
      }
    >
      <div className={styles.body}>
        {query.isError ? (
          <ErrorState
            message={copy.error}
            requestId={query.error instanceof ApiError ? query.error.requestId : undefined}
            onRetry={() => void query.refetch()}
          />
        ) : query.data === undefined ? (
          <Skeleton width="100%" height={220} />
        ) : (
          <HeatGrid cells={query.data.hours.cells} />
        )}
      </div>
    </Panel>
  );
}

type RestRow = RubricLearning['rest'][number];

function restLine(row: RestRow): string {
  if (row.few) return copy.learning.few;
  if (row.advice === null) return copy.learning.keep;
  return copy.learning.advice(row.advice.toDays, row.advice.reason);
}

/** The learning: four weeks of advice, then the rests and hours change themselves (owner's switch). */
export function RubricsLearning() {
  const query = useQuery(rubricLearningQueryOptions());
  const update = useUpdateRubricLearning();
  const toast = useToast();
  const data = query.data;
  if (query.isError)
    return (
      <Panel title={copy.learning.title}>
        <ErrorState
          message={query.error instanceof ApiError && query.error.status === 503 ? copy.learning.pending : copy.error}
          requestId={query.error instanceof ApiError ? query.error.requestId : undefined}
          onRetry={() => void query.refetch()}
        />
      </Panel>
    );
  return (
    <Panel title={copy.learning.title} note={copy.learning.note}>
      <div className={styles.body}>
        {data === undefined ? (
          <Skeleton width="100%" height={160} />
        ) : (
          <>
            <p className={styles.muted}>
              {copy.learning.mode[data.mode]}
              {data.applyFrom === null ? '' : ` ${copy.learning.applyFrom(mskWhen(data.applyFrom))}`}
            </p>
            <Switch
              isSelected={data.applyEnabled}
              isDisabled={update.isPending}
              onChange={(enabled) =>
                update.mutate(enabled, {
                  onError: () => toast.show({ tone: 'error', title: copy.learning.saveError })
                })
              }
            >
              {copy.learning.switch}
            </Switch>
            <ul className={styles.sliceRows} aria-label={copy.learning.restTitle}>
              {data.rest.map((row) => (
                <li key={row.rubric} className={styles.sliceRow}>
                  <span>
                    {RUBRIC_TITLES[row.rubric]} · {copy.learning.restDays(row.restDays)}
                    {row.source === 'default' ? '' : ` (${copy.learning.source[row.source]})`}
                  </span>
                  <span className={styles.muted}>{restLine(row)}</span>
                </li>
              ))}
            </ul>
            <ul className={styles.sliceRows} aria-label={copy.learning.hoursTitle}>
              {data.hours.map((group) => (
                <li key={group.group} className={styles.sliceRow}>
                  <span>
                    {copy.learning.groups[group.group]} ·{' '}
                    {group.slots.map((slot) => `${copy.learning.parts[slot.part]} ${clock(slot.minute)}`).join(', ')}
                  </span>
                  <span className={styles.muted}>
                    {group.slots
                      .filter((slot) => slot.advice !== null)
                      .map((slot) =>
                        copy.learning.hourAdvice(copy.learning.parts[slot.part], clock(slot.advice?.toMinute ?? 0))
                      )
                      .join(', ') || copy.learning.hoursFew(group.n)}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Panel>
  );
}
