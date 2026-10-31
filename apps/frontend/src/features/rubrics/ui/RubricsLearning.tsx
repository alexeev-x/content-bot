import { RUBRIC_TITLES, type RubricCompare, type RubricLearning } from '@alexeev/contracts';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError } from '../../../shared/api/http-client';
import {
  EmptyState,
  ErrorState,
  Panel,
  SegmentedControl,
  Skeleton,
  Switch,
  useMediaQuery,
  useToast
} from '../../../shared/ui';
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

type HeatCell = RubricCompare['hours']['cells'][number];
type HeatRow = { id: string; label: string; sub?: string; cells: (HeatCell | undefined)[] };

/** A band folds its hours into one cell: the posts-weighted mean score; below three posts the post count only. */
function foldBand(cells: HeatCell[]): HeatCell | undefined {
  if (cells.length === 0) return undefined;
  const n = cells.reduce((sum, cell) => sum + cell.n, 0);
  const scored = cells.filter((cell): cell is HeatCell & { x: number } => cell.x !== null);
  const weight = scored.reduce((sum, cell) => sum + cell.n, 0);
  const x = weight === 0 ? null : scored.reduce((sum, cell) => sum + cell.x * cell.n, 0) / weight;
  const first = cells[0] as HeatCell;
  return { weekday: first.weekday, hour: first.hour, n, x, trial: cells.some((cell) => cell.trial) };
}

function heatRows(cells: HeatCell[], bands: boolean): HeatRow[] {
  const at = new Map<string, HeatCell>(cells.map((cell) => [`${cell.weekday}:${cell.hour}`, cell]));
  const days = WEEKDAYS.map((_, weekday) => weekday);
  if (!bands)
    return HOURS.map((hour) => ({
      id: String(hour),
      label: `${hour}:00`,
      cells: days.map((weekday) => at.get(`${weekday}:${hour}`))
    }));
  return copy.bands.map((band) => ({
    id: band.id,
    label: band.label,
    sub: `${band.from}–${band.to}`,
    cells: days.map((weekday) =>
      foldBand(
        HOURS.filter((hour) => hour >= band.from && hour <= band.to).flatMap(
          (hour) => at.get(`${weekday}:${hour}`) ?? []
        )
      )
    )
  }));
}

/**
 * Weekday × Moscow hour: the median score of the rubric posts sent there. Seven day columns fill the panel; on a phone
 * the hours fold into four bands so nothing scrolls sideways. Empty cell: no posts; a bare number: under three posts.
 */
export function HeatGrid({ cells }: { cells: RubricCompare['hours']['cells'] }) {
  const isPhone = useMediaQuery('(max-width: 599px)');
  if (cells.length === 0)
    return <EmptyState size="compact" icon="clock" title={copy.heatEmpty} hint={copy.heatEmptyHint} />;
  const rows = heatRows(cells, isPhone);
  return (
    <div className={styles.heatBox}>
      <table className={styles.heat}>
        <caption className={styles.muted}>{isPhone ? copy.heatCaptionBands : copy.heatCaption}</caption>
        <thead>
          <tr>
            <th scope="col">
              <span className={styles.visuallyHidden}>{copy.heatDay}</span>
            </th>
            {WEEKDAYS.map((name) => (
              <th key={name} scope="col">
                {name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <th scope="row">
                {row.label}
                {row.sub === undefined ? null : <span className={styles.heatSub}>{row.sub}</span>}
              </th>
              {row.cells.map((cell, weekday) => (
                <td
                  key={WEEKDAYS[weekday]}
                  data-tone={tone(cell?.x ?? null)}
                  title={cell === undefined ? undefined : copy.heatCell(cell.n, times(cell.x), cell.trial)}
                >
                  {cell === undefined ? '' : cell.x === null ? cell.n : times(cell.x).slice(1)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className={styles.muted}>{copy.heatNote}</p>
    </div>
  );
}

export function RubricsHours() {
  const [days, setDays] = useState<30 | 90>(90);
  const query = useQuery(rubricCompareQueryOptions(days));
  return (
    <Panel
      title={copy.heatTitle}
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
  // Nothing to advise on yet (no scored posts): the panel would be a switch and a note, so it stays out of the way.
  if (data !== undefined && data.rest.length === 0 && data.hours.length === 0) return null;
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
