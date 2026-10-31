import { RUBRIC_TITLES, type ForecastSlotDto, type RubricForecastDto } from '@alexeev/contracts';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError } from '../../../shared/api/http-client';
import {
  Banner,
  Disclosure,
  EmptyState,
  ErrorState,
  Icon,
  Panel,
  SegmentedControl,
  Skeleton
} from '../../../shared/ui';
import { rubricForecastQueryOptions } from '../api/rubrics-queries';
import { dayLabel, mskTime, shortDayLabel, weeksOf } from '../model/msk';
import { rubricsCopy as copy } from './copy';
import styles from './RubricsForecast.module.css';

type View = 'month' | 'list';

function SlotLine({ slot, withReason }: { slot: ForecastSlotDto; withReason: boolean }) {
  return (
    <li className={styles.slot}>
      <time className={styles.time} dateTime={slot.at}>
        {mskTime(slot.at)}
      </time>
      <span className={styles.slotTitle}>{RUBRIC_TITLES[slot.rubricKey]}</span>
      {slot.hasPicture ? (
        <span className={styles.mark} title={copy.picture}>
          <Icon name="image" size={14} aria-hidden="true" />
          <span className={styles.visuallyHidden}>{copy.picture}</span>
        </span>
      ) : null}
      {slot.hasPoll ? (
        <span className={styles.mark} title={copy.poll}>
          <Icon name="chart" size={14} aria-hidden="true" />
          <span className={styles.visuallyHidden}>{copy.poll}</span>
        </span>
      ) : null}
      {withReason ? <span className={styles.reason}>{slot.reason.text}</span> : null}
    </li>
  );
}

function MonthView({ forecast }: { forecast: RubricForecastDto }) {
  const byDay = new Map(forecast.days.map((day) => [day.date, day.slots]));
  return (
    <table className={styles.month} aria-label={copy.views.month}>
      <thead>
        <tr className={styles.weekHead}>
          {copy.weekdays.map((weekday) => (
            <th key={weekday} className={styles.weekday} scope="col">
              {weekday}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className={styles.weeks}>
        {weeksOf(forecast.from, forecast.until).map((week) => (
          <tr key={week[0]} className={styles.weekRow}>
            {week.map((day) => {
              const slots = byDay.get(day);
              return (
                <td key={day} className={slots === undefined ? styles.outside : styles.cell} aria-label={dayLabel(day)}>
                  <span className={styles.date}>{shortDayLabel(day)}</span>
                  {slots !== undefined && slots.length > 0 ? (
                    <ul className={styles.slots}>
                      {slots.map((slot) => (
                        <SlotLine key={slot.at} slot={slot} withReason={false} />
                      ))}
                    </ul>
                  ) : null}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ListView({ forecast }: { forecast: RubricForecastDto }) {
  return (
    <ol className={styles.list}>
      {forecast.days
        .filter((day) => day.slots.length > 0)
        .map((day) => (
          <li key={day.date} className={styles.listDay}>
            <h3 className={styles.listDate}>{dayLabel(day.date)}</h3>
            <ul className={styles.slots}>
              {day.slots.map((slot) => (
                <SlotLine key={slot.at} slot={slot} withReason />
              ))}
            </ul>
          </li>
        ))}
    </ol>
  );
}

/** «Рубрики» → Календарь: the 35-day forecast as a month or a list, and the rubrics this Worker cannot run. */
export function RubricsForecast() {
  const query = useQuery(rubricForecastQueryOptions());
  const [view, setView] = useState<View>('month');

  if (query.isPending)
    return (
      <Panel>
        <output className={styles.loading} aria-busy="true" aria-label={copy.loading}>
          <Skeleton width="100%" height={320} />
        </output>
      </Panel>
    );
  if (query.isError)
    return (
      <Panel>
        <ErrorState
          message={copy.error}
          requestId={query.error instanceof ApiError ? query.error.requestId : undefined}
          onRetry={() => void query.refetch()}
        />
      </Panel>
    );

  const forecast = query.data;
  const total = forecast.days.reduce((sum, day) => sum + day.slots.length, 0);
  return (
    <div className={styles.stack}>
      <Banner tone="info" title={copy.forecastTitle}>
        {copy.forecastBody}
      </Banner>
      <Panel>
        <div className={styles.panel}>
          <div className={styles.toolbar}>
            <SegmentedControl
              label={copy.views.label}
              options={[
                { id: 'month', label: copy.views.month, icon: 'calendar' },
                { id: 'list', label: copy.views.list, icon: 'menu' }
              ]}
              value={view}
              onChange={(id) => setView(id === 'list' ? 'list' : 'month')}
            />
            <span className={styles.computed}>{copy.computedAt(mskTime(forecast.computedAt))}</span>
          </div>
          {total === 0 ? (
            <EmptyState title={copy.empty} description={copy.emptyHint} />
          ) : view === 'month' ? (
            <MonthView forecast={forecast} />
          ) : (
            <ListView forecast={forecast} />
          )}
        </div>
      </Panel>
      {forecast.unavailable.length === 0 ? null : (
        <Disclosure id="rubrics-unavailable" title={copy.unavailableTitle(forecast.unavailable.length)}>
          <ul className={styles.unavailable}>
            {forecast.unavailable.map((each) => (
              <li key={each.rubricKey}>
                <strong>{RUBRIC_TITLES[each.rubricKey]}</strong>{' '}
                <span className={styles.reason}>
                  {copy.missing(each.missing.map((need) => copy.needs[need]).join(', '))}
                </span>
              </li>
            ))}
          </ul>
        </Disclosure>
      )}
    </div>
  );
}
