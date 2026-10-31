import { RUBRIC_TITLES, type RubricSlotDto } from '@alexeev/contracts';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError } from '../../../shared/api/http-client';
import {
  Button,
  ConfirmDialog,
  DetailRow,
  DetailSection,
  DetailSheet,
  ErrorState,
  Skeleton,
  useToast
} from '../../../shared/ui';
import { rubricSlotQueryOptions, useSkipRubricSlot } from '../api/rubrics-queries';
import { mskWhen } from '../model/msk';
import { calendarCopy } from './calendar-copy';
import { rubricsCopy as copy } from './copy';
import { SlotState } from './SlotState';
import styles from './RubricsPage.module.css';

// History, rehearsal and the rare-state list still import the slot's state and drawer from here.
export { SlotState };

const SKIPPABLE: readonly RubricSlotDto['state'][] = ['planned', 'building', 'ready'];

/** One drawer for a real slot, opened from the calendar, the rubric's history and the rehearsal journal. */
export function SlotDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const slot = useQuery(rubricSlotQueryOptions(id));
  const skip = useSkipRubricSlot();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const data = slot.data;
  const title = data === undefined ? '' : RUBRIC_TITLES[data.rubricKey];
  return (
    <DetailSheet
      isOpen
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={copy.slots.detailTitle(title)}
      subtitle={data === undefined ? undefined : `${mskWhen(data.at)} МСК`}
      status={data === undefined ? null : <SlotState state={data.state} />}
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
          message={copy.loadError}
          requestId={slot.error instanceof ApiError ? slot.error.requestId : undefined}
          onRetry={() => void slot.refetch()}
        />
      ) : (
        <>
          <DetailSection label={calendarCopy.sections.slot}>
            <DetailRow label={copy.slots.reason}>{slot.data.reason.text}</DetailRow>
            {slot.data.detail === null ? null : (
              <DetailRow label={copy.slots.states[slot.data.state]}>
                {copy.slots.problem(slot.data.detail.code, slot.data.detail.step)}
              </DetailRow>
            )}
            {slot.data.candidates.length > 1 ? (
              <DetailRow label={copy.slots.fallbacks}>
                {slot.data.candidates
                  .slice(1)
                  .map((key) => RUBRIC_TITLES[key])
                  .join(', ')}
              </DetailRow>
            ) : null}
            <DetailRow label={copy.slots.attempts}>
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
            </DetailRow>
          </DetailSection>
        </>
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
              onError: (error) => {
                const reason = error instanceof ApiError ? error.details?.['reason'] : undefined;
                toast.show({
                  tone: 'error',
                  title:
                    reason === 'ALREADY_RELEASED'
                      ? copy.slots.skipReleased
                      : reason === 'NOT_LIVE'
                        ? copy.slots.skipEnded
                        : copy.slots.skipFailed
                });
                setConfirming(false);
              }
            })
          }
        />
      )}
    </DetailSheet>
  );
}
