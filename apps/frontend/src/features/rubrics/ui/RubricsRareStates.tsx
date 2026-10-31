import type { RubricCompare, RubricLock, RubricSlotDto } from '@alexeev/contracts';
import { Banner, Panel, StatusPill } from '../../../shared/ui';
import { analyticsCopy } from './analytics-copy';
import { rubricsCopy as copy } from './copy';
import { HeatGrid } from './RubricsLearning';
import { SlotState } from './UpcomingSlots';
import styles from './RubricsAnalytics.module.css';

// «Тестирование» → «Рубрики» (owner, 31.10.2026: answer 15): every state «Рубрики» can show, drawn by the
// real components with made-up data, so a state that happens once a month is seen before it happens. DEV only.

const SLOT_STATES = Object.keys(copy.slots.states) as RubricSlotDto['state'][];
const LOCKS = Object.keys(copy.scheduler.locks) as RubricLock[];
const COMMENT_STATES = Object.keys(analyticsCopy.commentsState).filter((state) => state !== 'ok') as (
  'limited' | 'not_connected' | 'no_data' | 'ai_unavailable'
)[];
/** One cell of every tone, plus thin and trial cells. */
const CELLS: RubricCompare['hours']['cells'] = [
  { weekday: 0, hour: 12, n: 4, x: 1.6, trial: false },
  { weekday: 0, hour: 19, n: 5, x: 1.2, trial: false },
  { weekday: 1, hour: 19, n: 3, x: 1, trial: false },
  { weekday: 2, hour: 13, n: 3, x: 0.85, trial: true },
  { weekday: 3, hour: 20, n: 6, x: 0.6, trial: false },
  { weekday: 5, hour: 11, n: 2, x: null, trial: true }
];

export function RubricsRareStates() {
  return (
    <div className={styles.stack}>
      <Panel title="Слоты: все состояния">
        <ul className={`${styles.body} ${styles.pills}`}>
          {SLOT_STATES.map((state) => (
            <li key={state}>
              <SlotState state={state} />
            </li>
          ))}
        </ul>
      </Panel>
      <Panel title="Почему планировщик стоит">
        <div className={styles.body}>
          {LOCKS.map((lock) => (
            <Banner
              key={lock}
              tone={lock === 'SWITCHED_OFF' ? 'info' : 'warning'}
              title={copy.scheduler.locks[lock]}
              size="sm"
            />
          ))}
        </div>
      </Panel>
      <Panel title="Аналитика: метки и пустые состояния">
        <div className={styles.body}>
          <ul className={styles.pills}>
            <li>
              <StatusPill label={analyticsCopy.best} group="done" icon="check-circle" />
            </li>
            <li>
              <StatusPill label={analyticsCopy.worst} group="failed" icon="alert" />
            </li>
            <li>
              <span className={styles.muted}>{analyticsCopy.few}</span>
            </li>
          </ul>
          {COMMENT_STATES.map((state) => (
            <p key={state} className={styles.muted}>
              {analyticsCopy.commentsState[state]}
            </p>
          ))}
          <p className={styles.muted}>{analyticsCopy.pending}</p>
          <p className={styles.muted}>{analyticsCopy.empty}</p>
          {(['advise', 'apply', 'off'] as const).map((mode) => (
            <p key={mode} className={styles.muted}>
              {analyticsCopy.learning.mode[mode]}
            </p>
          ))}
          <HeatGrid cells={CELLS} />
        </div>
      </Panel>
    </div>
  );
}
