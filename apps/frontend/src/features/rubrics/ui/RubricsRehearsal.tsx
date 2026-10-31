import { RUBRIC_TITLES, rubricSlotReason, type RubricRehearsalDto } from '@alexeev/contracts';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError } from '../../../shared/api/http-client';
import { EmptyState, ErrorState, Panel, Skeleton, StatusPill, Switch, type StatusGroup } from '../../../shared/ui';
import { rubricRehearsalQueryOptions } from '../api/rubrics-queries';
import { mskWhen } from '../model/msk';
import { rubricsCopy } from './copy';
import { SlotDrawer, SlotState } from './UpcomingSlots';
import styles from './RubricsPage.module.css';

// «Тестирование → Репетиция» (owner, 31.10.2026): the DEV week-long test's journal — every rubric slot, the failure
// staged for it, what should have happened and whether it did. DEV only.

type Item = RubricRehearsalDto['items'][number];

const SCENARIO: Record<Item['scenario'], string> = {
  none: 'Без сбоя',
  build_crash: 'Сборка оборвалась, замена',
  build_fail: 'Сборка упала',
  build_late: 'Сборка не успевает',
  tg_429: 'Telegram: «слишком часто»',
  tg_timeout: 'Telegram не ответил',
  tg_forbidden: 'Канал недоступен'
};

const VERDICT: Record<
  Item['verdict'],
  { label: string; group: StatusGroup; icon: 'check-circle' | 'x-circle' | 'minus-circle' | 'clock' }
> = {
  ok: { label: 'Как задумано', group: 'done', icon: 'check-circle' },
  bad: { label: 'Не так', group: 'failed', icon: 'x-circle' },
  void: { label: 'Не в счёт', group: 'muted', icon: 'minus-circle' },
  pending: { label: 'Ждёт итога', group: 'pending', icon: 'clock' }
};

export function RubricsRehearsal() {
  const journal = useQuery(rubricRehearsalQueryOptions());
  const [onlyBad, setOnlyBad] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  if (journal.isPending) return <Skeleton width="100%" height={240} />;
  if (journal.isError)
    return journal.error instanceof ApiError && journal.error.details?.['reason'] === 'MIGRATION_PENDING' ? (
      <p className={styles.meta}>{rubricsCopy.migrationPending}</p>
    ) : (
      <ErrorState
        message={rubricsCopy.loadError}
        requestId={journal.error instanceof ApiError ? journal.error.requestId : undefined}
        onRetry={() => void journal.refetch()}
      />
    );
  const data = journal.data;
  if (!data.active)
    return (
      <Panel title="Репетиция">
        <EmptyState
          size="compact"
          icon="clock"
          title="Репетиция не идёт"
          hint="Включите «Автопубликация рубрик» в разделе «Рубрики» и выберите тестовый канал: начнётся недельный тест."
        />
      </Panel>
    );
  const items = onlyBad ? data.items.filter((item) => item.verdict === 'bad') : data.items;
  return (
    <div className={styles.stack}>
      <Panel title="Итог">
        {data.startedAt === null ? (
          <EmptyState
            size="compact"
            icon="clock"
            title="Ещё ни одного слота"
            hint="Итог появится после первого слота теста."
          />
        ) : (
          <div className={styles.panelBody}>
            <p className={styles.meta}>
              Тест идёт с {mskWhen(data.startedAt)} МСК. Как задумано: {data.counts.ok} · не так: {data.counts.bad} · не
              в счёт: {data.counts.void} · ждут итога: {data.counts.pending}
            </p>
            <Switch isSelected={onlyBad} onChange={setOnlyBad}>
              Только «Не так»
            </Switch>
          </div>
        )}
      </Panel>
      <Panel title="Слоты">
        {items.length === 0 ? (
          <EmptyState
            size="compact"
            icon={onlyBad ? 'check-circle' : 'clock'}
            title={onlyBad ? 'Всё как задумано' : 'Слотов ещё нет'}
          />
        ) : (
          <ul className={styles.slotRows}>
            {items.map((item) => {
              const verdict = VERDICT[item.verdict];
              return (
                <li key={item.slotId}>
                  <button
                    type="button"
                    className={styles.journalRow}
                    aria-label={`Открыть слот «${RUBRIC_TITLES[item.rubricKey]}», ${mskWhen(item.at)}: ${
                      SCENARIO[item.scenario]
                    }, ${verdict.label}${item.note === null ? '' : `. ${item.note}`}`}
                    onClick={() => setOpen(item.slotId)}
                  >
                    <time dateTime={item.at} className={styles.slotWhen}>
                      {mskWhen(item.at)}
                    </time>
                    <span className={styles.slotName}>
                      {RUBRIC_TITLES[item.rubricKey]}
                      <span className={styles.message}>
                        {SCENARIO[item.scenario]}
                        {item.note === null ? '' : ` — ${item.note}`}
                        {item.note === null && item.code !== null ? ` — ${rubricSlotReason(item.code)}` : ''}
                      </span>
                    </span>
                    <span className={styles.journalPills}>
                      {item.state === null ? null : <SlotState state={item.state} />}
                      <StatusPill label={verdict.label} group={verdict.group} icon={verdict.icon} />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
      {open === null ? null : <SlotDrawer id={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
