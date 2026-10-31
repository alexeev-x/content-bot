import { RUBRIC_TITLES, rubricSlotReason, type RubricKey } from '@alexeev/contracts';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError } from '../../../shared/api/http-client';
import { Drawer, ErrorState, Skeleton } from '../../../shared/ui';
import { rubricHistoryQueryOptions } from '../api/rubrics-queries';
import { mskWhen } from '../model/msk';
import { rubricsCopy as copy } from './copy';
import { SlotDrawer, SlotState } from './UpcomingSlots';
import styles from './RubricsPage.module.css';

/**
 * «История» of one rubric (owner, 31.10.2026: «вышла не вышла, так же причину»): its last slots, each with whether it
 * went out and why not; a slot opens its steps.
 */
export function RubricHistory({ rubric, onClose }: { rubric: RubricKey; onClose: () => void }) {
  const history = useQuery(rubricHistoryQueryOptions(rubric));
  const [open, setOpen] = useState<string | null>(null);
  const title = RUBRIC_TITLES[rubric];
  if (open !== null) return <SlotDrawer id={open} onClose={() => setOpen(null)} />;
  return (
    <Drawer isOpen onOpenChange={(isOpen) => (isOpen ? undefined : onClose())} title={copy.history.title(title)}>
      {history.isPending ? (
        <Skeleton width="100%" height={160} />
      ) : history.isError ? (
        <ErrorState
          message={copy.loadError}
          requestId={history.error instanceof ApiError ? history.error.requestId : undefined}
          onRetry={() => void history.refetch()}
        />
      ) : history.data.slots.length === 0 ? (
        <p className={styles.meta}>{copy.history.empty}</p>
      ) : (
        <ul className={styles.slotRows}>
          {history.data.slots.map((slot) => (
            <li key={slot.id}>
              <button
                type="button"
                className={styles.slotRow}
                aria-label={`${copy.history.slot(mskWhen(slot.at))}: ${copy.slots.states[slot.state]}, ${
                  slot.detail === null ? slot.reason.text : (rubricSlotReason(slot.detail.code) ?? slot.detail.code)
                }`}
                onClick={() => setOpen(slot.id)}
              >
                <time dateTime={slot.at} className={styles.slotWhen}>
                  {mskWhen(slot.at)}
                </time>
                <span className={styles.slotName}>
                  {slot.detail === null ? slot.reason.text : (rubricSlotReason(slot.detail.code) ?? slot.detail.code)}
                </span>
                <SlotState state={slot.state} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Drawer>
  );
}
