import { rubricSlotReason, type RubricKey } from '@alexeev/contracts';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError } from '../../../shared/api/http-client';
import { EmptyState, ErrorState, ListRow, ListRowSkeleton, PanelList } from '../../../shared/ui';
import { rubricHistoryQueryOptions } from '../api/rubrics-queries';
import { mskWhen } from '../model/msk';
import { rubricsCopy as copy } from './copy';
import { listCopy } from './list-copy';
import { SlotDrawer, SlotState } from './UpcomingSlots';

/**
 * «История» of one rubric (owner, 31.10.2026: «вышла не вышла, так же причину»): its last slots, each with whether it
 * went out and why not; a slot opens its steps. Lives inside the rubric drawer.
 */
export function RubricHistory({ rubric }: { rubric: RubricKey }) {
  const history = useQuery(rubricHistoryQueryOptions(rubric));
  const [open, setOpen] = useState<string | null>(null);
  if (history.isPending)
    return (
      <PanelList aria-label={listCopy.detail.history}>
        <ListRowSkeleton />
        <ListRowSkeleton />
      </PanelList>
    );
  if (history.isError)
    return (
      <ErrorState
        message={copy.loadError}
        requestId={history.error instanceof ApiError ? history.error.requestId : undefined}
        onRetry={() => void history.refetch()}
      />
    );
  if (history.data.slots.length === 0)
    return (
      <EmptyState size="compact" icon="clock" title={listCopy.detail.historyEmpty} hint={listCopy.detail.historyHint} />
    );
  return (
    <>
      <PanelList aria-label={listCopy.detail.history}>
        {history.data.slots.map((slot) => (
          <ListRow
            key={slot.id}
            density="compact"
            title={slot.detail === null ? slot.reason.text : (rubricSlotReason(slot.detail.code) ?? slot.detail.code)}
            meta={<time dateTime={slot.at}>{mskWhen(slot.at)}</time>}
            status={<SlotState state={slot.state} />}
            onPress={() => setOpen(slot.id)}
          />
        ))}
      </PanelList>
      {open === null ? null : <SlotDrawer id={open} onClose={() => setOpen(null)} />}
    </>
  );
}
