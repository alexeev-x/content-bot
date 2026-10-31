import { RUBRIC_TITLES, type RubricSlotDto } from '@alexeev/contracts';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError } from '../../../shared/api/http-client';
import {
  Button,
  ConfirmDialog,
  Drawer,
  ErrorState,
  Panel,
  Skeleton,
  StatusPill,
  useToast,
  type StatusGroup
} from '../../../shared/ui';
import { rubricCalendarQueryOptions, rubricSlotQueryOptions, useSkipRubricSlot } from '../api/rubrics-queries';
import { addDays, mskDay, mskWhen } from '../model/msk';
import { rubricsCopy as copy } from './copy';
import styles from './RubricsPage.module.css';

const GROUP: Record<RubricSlotDto['state'], StatusGroup> = {
  planned: 'pending',
  building: 'active',
  ready: 'active',
  released: 'active',
  waiting_parent: 'active',
  unknown: 'unknown',
  sent: 'done',
  partial: 'retry',
  unresolved: 'unknown',
  send_failed: 'failed',
  missed: 'failed',
  empty: 'retry',
  skipped: 'muted',
  yielded: 'muted',
  cancelled: 'muted',
  superseded: 'muted'
};

const ICON = {
  pending: 'clock',
  active: 'loader',
  unknown: 'help',
  done: 'check-circle',
  retry: 'retry',
  failed: 'x-circle',
  muted: 'minus-circle'
} as const;

export function SlotState({ state }: { state: RubricSlotDto['state'] }) {
  const group = GROUP[state];
  return <StatusPill label={copy.slots.states[state]} group={group} icon={ICON[group]} />;
}

const SKIPPABLE: readonly RubricSlotDto['state'][] = ['planned', 'building', 'ready'];

function SlotDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const slot = useQuery(rubricSlotQueryOptions(id));
  const skip = useSkipRubricSlot();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const data = slot.data;
  const title = data === undefined ? '' : RUBRIC_TITLES[data.rubricKey];
  return (
    <Drawer
      isOpen
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={copy.slots.detailTitle(title)}
      meta={data === undefined ? null : <SlotState state={data.state} />}
      footer={
        data !== undefined && SKIPPABLE.includes(data.state) ? (
          <Button variant="secondary" onPress={() => setConfirming(true)}>
            {copy.slots.skip}
          </Button>
        ) : null
      }
    >
      {slot.isPending ? (
        <Skeleton width="100%" height={160} />
      ) : slot.isError ? (
        <ErrorState
          message={copy.error}
          requestId={slot.error instanceof ApiError ? slot.error.requestId : undefined}
          onRetry={() => void slot.refetch()}
        />
      ) : (
        <dl className={styles.detail}>
          <dt>{copy.slots.reason}</dt>
          <dd>
            {mskWhen(slot.data.at)} МСК · {slot.data.reason.text}
          </dd>
          {slot.data.detail === null ? null : (
            <>
              <dt>{copy.slots.states[slot.data.state]}</dt>
              <dd>{copy.slots.problem(slot.data.detail.code, slot.data.detail.step)}</dd>
            </>
          )}
          {slot.data.candidates.length > 1 ? (
            <>
              <dt>{copy.slots.fallbacks}</dt>
              <dd>
                {slot.data.candidates
                  .slice(1)
                  .map((key) => RUBRIC_TITLES[key])
                  .join(', ')}
              </dd>
            </>
          ) : null}
          <dt>{copy.slots.attempts}</dt>
          <dd>
            {slot.data.attempts.length === 0 ? (
              copy.slots.noAttempts
            ) : (
              <ol className={styles.attempts}>
                {slot.data.attempts.map((attempt) => (
                  <li key={`${attempt.attempt}:${attempt.step}`}>
                    {mskWhen(attempt.at)} · {RUBRIC_TITLES[attempt.rubricKey]} · {attempt.step} ·{' '}
                    {copy.slots.outcomes[attempt.outcome]}
                    {attempt.code === null ? '' : ` · ${attempt.code}`}
                    {attempt.message === null ? null : <span className={styles.message}>{attempt.message}</span>}
                  </li>
                ))}
              </ol>
            )}
          </dd>
        </dl>
      )}
      {data === undefined ? null : (
        <ConfirmDialog
          isOpen={confirming}
          onOpenChange={setConfirming}
          title={copy.slots.skipTitle(title, mskWhen(data.at))}
          description={copy.slots.skipBody}
          confirmLabel={copy.slots.skip}
          isPending={skip.isPending}
          onConfirm={() =>
            skip.mutate(data.id, {
              onSuccess: () => {
                setConfirming(false);
                toast.show({ tone: 'success', title: copy.slots.skipDone });
              },
              onError: () => toast.show({ tone: 'error', title: copy.slots.skipFailed })
            })
          }
        />
      )}
    </Drawer>
  );
}

/** «Ближайшие слоты»: the real slots of the next week, each opening its detail. */
export function UpcomingSlots({ today }: { today: string }) {
  const until = addDays(today, 7);
  const slots = useQuery(rubricCalendarQueryOptions(addDays(today, -1), until));
  const [open, setOpen] = useState<string | null>(null);
  const shown = (slots.data?.slots ?? []).filter((slot) => mskDay(slot.at) >= today);
  return (
    <Panel title={copy.slots.title}>
      {slots.isPending ? (
        <Skeleton width="100%" height={96} />
      ) : slots.isError ? (
        <ErrorState
          message={copy.error}
          requestId={slots.error instanceof ApiError ? slots.error.requestId : undefined}
          onRetry={() => void slots.refetch()}
        />
      ) : shown.length === 0 ? (
        <p className={styles.meta}>{copy.slots.empty}</p>
      ) : (
        <ul className={styles.slotRows}>
          {shown.map((slot) => (
            <li key={slot.id}>
              <button
                type="button"
                className={styles.slotRow}
                aria-label={copy.slots.open(RUBRIC_TITLES[slot.rubricKey], mskWhen(slot.at))}
                onClick={() => setOpen(slot.id)}
              >
                <time dateTime={slot.at} className={styles.slotWhen}>
                  {mskWhen(slot.at)}
                </time>
                <span className={styles.slotName}>{RUBRIC_TITLES[slot.rubricKey]}</span>
                <SlotState state={slot.state} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {open === null ? null : <SlotDrawer id={open} onClose={() => setOpen(null)} />}
    </Panel>
  );
}
